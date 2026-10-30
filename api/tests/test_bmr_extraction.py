"""Tests for the StkFlo native BMR extractor and BMR import contract."""
from __future__ import annotations
import csv
import io
import asyncio
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest
from zipfile import ZipFile

from openpyxl import Workbook

from app.bmr_extractor_core import extract, _qty
from app.routers.bmr_product_migration import _yes, _version, read_package
from app.routers import bmr_extraction
from starlette.datastructures import UploadFile


def sample_product_workbook():
    wb=Workbook()
    sh=wb.active
    sh.title="Product List"
    sh.append(["Product Name","Product Code","Shelf Life","Licence","Remarks","Medisource"])
    sh.append(["Test Product","TEST1",90,"UNLICENSED","CD, STOCK","M"])
    # Must never be imported without a corresponding BMR in the ZIP.
    sh.append(["Not extracted","OTHER1",30,"LICENSED","","N/A"])
    out=io.BytesIO()
    wb.save(out)
    return out.getvalue()


def test_docx():
    W="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    def table(rows):
        result=[]
        for row in rows:
            cells="".join(
                f'<w:tc><w:p><w:r><w:t>{value}</w:t></w:r></w:p></w:tc>'
                for value in row
            )
            result.append("<w:tr>"+cells+"</w:tr>")
        return "<w:tbl>"+"".join(result)+"</w:tbl>"
    head=table([
        ["Test Product 100mg/5ml","ES234.V03"],
        ["Product Code","TEST1"],
        ["Product Shelf Life","90 Days"],
        ["Storage Conditions","Room Temperature"],
    ])
    formula=table([
        ["Ingredient Name","Strength","Master Formula","Manufacturer / Supplier"],
        ["Test Powder","100mg","2.00g","Test Supplier"],
        ["Purified Water","","qs to 100ml",""],
    ])
    document=f'<w:document xmlns:w="{W}"><w:body>{head}{formula}</w:body></w:document>'
    archive=io.BytesIO()
    with ZipFile(archive,"w") as z:
        z.writestr("word/document.xml",document)
    return archive.getvalue()


class BMRExtractorTests(unittest.TestCase):
    def test_medisource_maps_to_export_and_only_actual_bmrs_imported(self):
        archive=io.BytesIO()
        with ZipFile(archive,"w") as z:
            z.writestr("BMRs/T/TEST1.V03.docx",test_docx())
        result=extract(archive.getvalue(),sample_product_workbook())
        self.assertEqual(result["source_count"],1)
        self.assertEqual(result["product_count"],1)
        self.assertEqual(result["formula_count"],2)
        products=list(csv.DictReader(io.StringIO(result["products_csv"].lstrip("\ufeff"))))
        formulas=list(csv.DictReader(io.StringIO(result["formulas_csv"].lstrip("\ufeff"))))
        self.assertEqual(products[0]["product_code"],"TEST1")
        self.assertEqual(products[0]["bmr_version"],"V03")
        self.assertEqual(products[0]["export_line"],"EXPORT_LINE")
        self.assertEqual(products[0]["medisource_line"],"Yes")
        self.assertEqual(products[0]["controlled_drug"],"Yes")
        self.assertEqual(products[0]["stock_line"],"Yes")
        self.assertNotIn("OTHER1",result["products_csv"])
        self.assertEqual(formulas[0]["quantity_value"],"2.00")
        self.assertEqual(formulas[1]["quantity_type"],"QS to")
        self.assertEqual(formulas[1]["qs_target_value"],"100")
        self.assertFalse(result["issues"])

    def test_quantity_and_version_helpers(self):
        self.assertEqual(_qty("4 Tablets")[0],"Fixed")
        self.assertEqual(_qty("qs to 100ml")[0],"QS to")
        self.assertEqual(_qty("qs to 100ml")[3],"100")
        self.assertEqual(_version("V04"),4)
        self.assertTrue(_yes("M"))
        self.assertFalse(_yes("No"))

    def test_canonical_import_zip_reads_directly(self):
        archive=io.BytesIO()
        with ZipFile(archive,"w") as z:
            z.writestr("BMRs/T/TEST1.V03.docx",test_docx())
        extracted=extract(archive.getvalue(),sample_product_workbook())
        package=io.BytesIO()
        with ZipFile(package,"w") as z:
            z.writestr("Products.csv",extracted["products_csv"])
            z.writestr("Master_Formulas.csv",extracted["formulas_csv"])
        uploaded=UploadFile(file=io.BytesIO(package.getvalue()),filename="StkFlo_Import_Package.zip")
        result=asyncio.run(read_package(package=uploaded,_user=None))
        self.assertEqual(result["products_csv"],extracted["products_csv"].lstrip("\ufeff"))
        self.assertEqual(result["formulas_csv"],extracted["formulas_csv"].lstrip("\ufeff"))


    def test_single_file_from_server_import_folder(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)
            archive=folder/"Complete BMRs.zip"
            archive.write_bytes(b"not a valid zip but a valid filesystem selection")
            (folder/"Product List.xlsm").write_bytes(b"test")
            with patch.object(bmr_extraction, "IMPORT_DIR", folder):
                listed=bmr_extraction.server_files(_user=None)
                self.assertEqual([x["name"] for x in listed["archives"]], ["Complete BMRs.zip"])
                self.assertEqual([x["name"] for x in listed["workbooks"]], ["Product List.xlsm"])
                self.assertEqual(bmr_extraction._get_server_file("Complete BMRs.zip",(".zip",),175_000_000),
                                 archive.read_bytes())
                from fastapi import HTTPException
                with self.assertRaises(HTTPException):
                    bmr_extraction._get_server_file("../.env",(".zip",),175_000_000)
                with self.assertRaises(HTTPException):
                    bmr_extraction._get_server_file("/etc/passwd",(".zip",),175_000_000)

    def test_invalid_zip_rejected(self):
        with self.assertRaises(ValueError):
            extract(b"not a zip archive",sample_product_workbook())


if __name__ == "__main__":
    unittest.main()

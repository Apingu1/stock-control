# Production-test TLS certificates

Generated TLS files are stored in this directory but are intentionally excluded
from Git.

Expected runtime files:

- `stock-control.crt`
- `stock-control.key`
- `stock-control-ca.crt`

Generate them with:

```bash
./scripts/generate_test_tls_cert.sh stock-control.test <SERVER_IP>
```

Protect the private keys and do not commit them to the repository.

import React, { useEffect, useState } from "react";
import { formatNowChip } from "../../utils/format";

type Header = {
  tag: string;
  title: string;
  subtitle: string;
};

type Props = {
  header: Header;
  isSignedIn: boolean;
  onNewMaterial: () => void;
  onNewReceipt: () => void;
  onNewIssue: () => void;
};

const TopBar: React.FC<Props> = ({
  header,
  isSignedIn,
  onNewMaterial,
  onNewReceipt,
  onNewIssue,
}) => {
  const [now, setNow] = useState(() => formatNowChip());

  useEffect(() => {
    const t = setInterval(() => setNow(formatNowChip()), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="page-tag">{header.tag}</div>
        <div className="page-title">{header.title}</div>
        <div className="page-subtitle">{header.subtitle}</div>
      </div>

      {/* Centered status/time pill */}
      <div className="top-bar-center">
        <div className="chip chip-now" title="Live time (Europe/London)">
          <span className="chip-dot" />
          {now}
        </div>
      </div>

      {/* Primary actions */}
      <div className="top-bar-right">
        <button
          className="btn btn-accent-green"
          type="button"
          onClick={onNewMaterial}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          🧪 New Material
        </button>

        <button
          className="btn btn-accent-amber"
          type="button"
          onClick={onNewReceipt}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          📥 New Goods Receipt
        </button>

        <button
          className="btn btn-primary"
          type="button"
          onClick={onNewIssue}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          🚚 New Consumption
        </button>
      </div>
    </header>
  );
};

export default TopBar;

import React from "react";

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
  return (
    <header className="top-bar">
      <div>
        <div className="page-tag">{header.tag}</div>
        <div className="page-title">{header.title}</div>
        <div className="page-subtitle">{header.subtitle}</div>
      </div>

      <div className="top-bar-actions">
        <div className="chip">
          <span className="chip-dot" />
          Stock engine healthy
        </div>

        <button
          className="btn btn-ghost"
          type="button"
          onClick={onNewMaterial}
          disabled={!isSignedIn}
          title={!isSignedIn ? "Please sign in" : ""}
        >
          🧪 New Material
        </button>

        <button
          className="btn btn-ghost"
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

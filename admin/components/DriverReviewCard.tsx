"use client";

import { useState, useEffect } from "react";
import type { Driver } from "@/types/driver";
import { apiRequest } from "@/lib/api-client";

type DriverDecision = "approved" | "declined" | "blocked" | "reinstate" | "delete";

interface DriverReviewCardProps {
  driver: Driver;
  availableActions: DriverDecision[];
  onAction: (
    driverId: string,
    decision: DriverDecision,
    options?: { rejectionReason?: string }
  ) => Promise<void>;
  onWalletUpdate?: () => void;
}

export function DriverReviewCard({
  driver,
  availableActions,
  onAction,
  onWalletUpdate,
}: DriverReviewCardProps) {
  const [isProcessing, setIsProcessing] = useState<DriverDecision | null>(null);
  const [walletAmount, setWalletAmount] = useState<string>("");
  const [isSendingWallet, setIsSendingWallet] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const submittedDate = new Date(driver.submittedAt).toLocaleString();
  
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("flashride_admin_token")
      : null;

  const triggerAction = async (
    decision: DriverDecision,
    options?: { rejectionReason?: string }
  ) => {
    if (isProcessing) {
      return;
    }
    setIsProcessing(decision);
    try {
      await onAction(driver.id, decision, options);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDecline = async () => {
    const reason = window.prompt(
      "Please provide a reason for declining this application:",
      driver.rejectionReason ?? ""
    );

    if (reason === null) {
      return;
    }

    if (!reason.trim()) {
      window.alert("A rejection reason is required.");
      return;
    }

    await triggerAction("declined", { rejectionReason: reason.trim() });
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
    setDeleteConfirmName("");
  };

  const confirmDelete = async () => {
    if (deleteConfirmName.trim().toLowerCase() !== driver.name.trim().toLowerCase()) {
      window.alert("Name does not match. Please type the driver's name exactly as shown to confirm deletion.");
      return;
    }

    setShowDeleteConfirm(false);
    await triggerAction("delete");
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteConfirmName("");
  };

  const renderStatusBadge = () => {
    if (driver.accountStatus === "pending") {
      return <span className="status status-pending">Pending review</span>;
    }
    if (driver.accountStatus === "approved") {
      return <span className="status status-approved">Approved</span>;
    }
    if (driver.accountStatus === "declined") {
      return <span className="status status-declined">Declined</span>;
    }
    if (driver.accountStatus === "blocked") {
      return <span className="status status-blocked">Blocked</span>;
    }
    return null;
  };

  const loadWalletHistory = async () => {
    if (!token || !showHistory) return;
    
    setIsLoadingHistory(true);
    setWalletMessage(null);
    try {
      const response = await apiRequest<{ success: boolean; transactions: any[] }>({
        endpoint: `/admin/drivers/${driver.id}/wallet/history`,
        token,
      });
      setWalletHistory(response.transactions || []);
      if (response.transactions.length === 0) {
        setWalletMessage("No transaction history found");
        setTimeout(() => setWalletMessage(null), 3000);
      }
    } catch (error: any) {
      console.error("Failed to load wallet history:", error);
      const errorMsg = error?.message || "Failed to load transaction history";
      setWalletMessage(errorMsg);
      setTimeout(() => setWalletMessage(null), 5000);
      setWalletHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleToggleHistory = () => {
    setShowHistory(!showHistory);
  };

  useEffect(() => {
    if (showHistory && driver.accountStatus === "approved" && token) {
      loadWalletHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, driver.id, driver.accountStatus]);

  const handleSendWallet = async () => {
    if (!walletAmount.trim()) {
      setWalletMessage("Please enter an amount");
      setTimeout(() => setWalletMessage(null), 3000);
      return;
    }

    const amount = parseFloat(walletAmount);
    if (isNaN(amount) || amount <= 0) {
      setWalletMessage("Please enter a valid positive amount");
      setTimeout(() => setWalletMessage(null), 3000);
      return;
    }

    if (!token) {
      setWalletMessage("Authentication required");
      setTimeout(() => setWalletMessage(null), 3000);
      return;
    }

    setIsSendingWallet(true);
    setWalletMessage(null);

    try {
      // Get current wallet balance and add to it
      const currentBalance = driver.walletBalance || 0;
      const newBalance = currentBalance + amount;

      await apiRequest<{ success: boolean; driver: Driver; message: string }>({
        endpoint: `/admin/drivers/${driver.id}/wallet`,
        method: "PATCH",
        token,
        payload: { walletBalance: newBalance },
      });

      setWalletMessage(`Successfully added ${amount.toFixed(2)} MRU to wallet!`);
      setWalletAmount("");
      setTimeout(() => {
        setWalletMessage(null);
        if (onWalletUpdate) {
          onWalletUpdate();
        }
        // Reload history if it's currently shown
        if (showHistory) {
          loadWalletHistory();
        }
      }, 2000);
    } catch (error) {
      if (error instanceof Error) {
        setWalletMessage(error.message);
      } else {
        setWalletMessage("Failed to update wallet balance");
      }
      setTimeout(() => setWalletMessage(null), 3000);
    } finally {
      setIsSendingWallet(false);
    }
  };

  const renderActionButtons = () => {
    return availableActions.map((action) => {
      if (action === "declined") {
        return (
          <button
            key="decline"
            className="decline"
            onClick={handleDecline}
            disabled={isProcessing !== null}
          >
            {isProcessing === "declined" ? "Declining…" : "Decline"}
          </button>
        );
      }
      if (action === "approved") {
        return (
          <button
            key="approve"
            className="approve"
            onClick={() => triggerAction("approved")}
            disabled={isProcessing !== null}
          >
            {isProcessing === "approved" ? "Approving…" : "Approve"}
          </button>
        );
      }
      if (action === "blocked") {
        return (
          <button
            key="block"
            className="block"
            onClick={() => triggerAction("blocked")}
            disabled={isProcessing !== null}
          >
            {isProcessing === "blocked" ? "Blocking…" : "Block"}
          </button>
        );
      }
      if (action === "reinstate") {
        return (
          <button
            key="reinstate"
            className="approve"
            onClick={() => triggerAction("reinstate")}
            disabled={isProcessing !== null}
          >
            {isProcessing === "reinstate" ? "Reinstating…" : "Reinstate"}
          </button>
        );
      }
      if (action === "delete") {
        return (
          <button
            key="delete"
            className="delete"
            onClick={handleDelete}
            disabled={isProcessing !== null}
          >
            {isProcessing === "delete" ? "Deleting…" : "Delete"}
          </button>
        );
      }
      return null;
    });
  };

  return (
    <article className="card">
      <div className="card-header">
        <div>
          <h2>{driver.name}</h2>
          <p>Submitted on {submittedDate}</p>
        </div>
        {renderStatusBadge()}
      </div>

      <dl className="details-grid">
        <div>
          <dt>Email</dt>
          <dd>{driver.email}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{driver.phone_number}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{driver.country}</dd>
        </div>
        <div>
          <dt>Vehicle type</dt>
          <dd>{driver.vehicle_type}</dd>
        </div>
        <div>
          <dt>Registration #</dt>
          <dd>{driver.registration_number}</dd>
        </div>
        <div>
          <dt>Registration date</dt>
          <dd>{driver.registration_date}</dd>
        </div>
        <div>
          <dt>Driving license</dt>
          <dd>{driver.driving_license}</dd>
        </div>
        <div>
          <dt>Vehicle color</dt>
          <dd>{driver.vehicle_color ?? "—"}</dd>
        </div>
        <div>
          <dt>Proposed rate (per km)</dt>
          <dd>{driver.rate}</dd>
        </div>
        {driver.accountStatus === "approved" && (
          <div>
            <dt>Current Wallet Balance</dt>
            <dd>{(driver.walletBalance || 0).toFixed(2)} MRU</dd>
          </div>
        )}
      </dl>

      {driver.accountStatus === "approved" && (
        <div className="wallet-section">
          <div className="wallet-input-group">
            <input
              type="number"
              className="wallet-input"
              placeholder="Enter amount (MRU)"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              disabled={isSendingWallet}
              min="0"
              step="0.01"
            />
            <button
              className="wallet-send-button"
              onClick={handleSendWallet}
              disabled={isSendingWallet || !walletAmount.trim()}
            >
              {isSendingWallet ? "Sending…" : "Send"}
            </button>
          </div>
          {walletMessage && (
            <div className={`wallet-message ${walletMessage.includes("Successfully") ? "success" : "error"}`}>
              {walletMessage}
            </div>
          )}
          
          {/* Transaction History */}
          <div className="wallet-history-section">
            <button
              className="wallet-history-toggle"
              onClick={handleToggleHistory}
            >
              {showHistory ? "▼" : "▶"} Transaction History
            </button>
            
            {showHistory && (
              <div className="wallet-history-list">
                {isLoadingHistory ? (
                  <div className="wallet-history-loading">Loading history...</div>
                ) : walletHistory.length === 0 ? (
                  <div className="wallet-history-empty">No transactions yet</div>
                ) : (
                  walletHistory.map((tx: any) => {
                    const isCommission = tx.amount < 0;
                    const isAdminDeposit = tx.amount > 0 && tx.admin;
                    return (
                      <div key={tx.id} className="wallet-history-item">
                        <div className="wallet-history-header">
                          <span className={`wallet-history-amount ${isCommission ? 'commission' : ''}`}>
                            {isCommission 
                              ? `-${Math.abs(tx.amount).toFixed(2)} MRU (Commission)`
                              : `+${tx.amount.toFixed(2)} MRU`
                            }
                          </span>
                          <span className="wallet-history-date">
                            {new Date(tx.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="wallet-history-details">
                          <span>Before: {tx.balanceBefore.toFixed(2)} MRU</span>
                          <span>→</span>
                          <span>After: {tx.balanceAfter.toFixed(2)} MRU</span>
                        </div>
                        {tx.admin && (
                          <div className="wallet-history-admin">
                            Admin: {tx.admin.name || tx.admin.email}
                          </div>
                        )}
                        {isCommission && (
                          <div className="wallet-history-admin" style={{ color: '#b91c1c' }}>
                            System: Commission deduction
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="actions">
        {renderActionButtons()}
      </footer>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-modal-overlay" onClick={cancelDelete}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Confirm Deletion</h3>
            <p className="delete-warning">
              This action cannot be undone. The driver will be permanently deleted from the database.
              All their credentials (email, phone number, registration number) will be removed,
              and they will be able to create a new account using the same credentials.
            </p>
            <p className="delete-instruction">
              To confirm, please type the driver's name: <strong>{driver.name}</strong>
            </p>
            <input
              type="text"
              className="delete-confirm-input"
              placeholder="Type driver name to confirm"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              autoFocus
            />
            <div className="delete-modal-actions">
              <button className="delete-cancel" onClick={cancelDelete}>
                Cancel
              </button>
              <button
                className="delete-confirm"
                onClick={confirmDelete}
                disabled={
                  deleteConfirmName.trim().toLowerCase() !== driver.name.trim().toLowerCase()
                }
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .card {
          background: #ffffff;
          border-radius: 1rem;
          padding: 1.5rem;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }

        h2 {
          margin: 0;
          font-size: 1.4rem;
        }

        p {
          margin: 0.2rem 0 0;
          color: #64748b;
          font-size: 0.95rem;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .status-pending {
          background: rgba(251, 191, 36, 0.14);
          color: #b45309;
        }

        .status-approved {
          background: rgba(74, 222, 128, 0.16);
          color: #047857;
        }

        .status-declined {
          background: rgba(249, 112, 94, 0.16);
          color: #b91c1c;
        }

        .status-blocked {
          background: rgba(96, 165, 250, 0.16);
          color: #1d4ed8;
        }

        .details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin: 0;
        }

        dt {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #94a3b8;
          margin-bottom: 0.3rem;
        }

        dd {
          margin: 0;
          font-size: 1rem;
          color: #0f172a;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        button {
          border: none;
          border-radius: 0.75rem;
          padding: 0.65rem 1.25rem;
          font-weight: 600;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .approve {
          background: linear-gradient(135deg, #22c55e, #15803d);
          color: #ffffff;
        }

        .block {
          background: #fef3c7;
          color: #f59e0b;
        }

        .decline {
          background: #f1f5f9;
          color: #ef4444;
        }

        .delete {
          background: #fee2e2;
          color: #dc2626;
        }

        button:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .wallet-section {
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.75rem;
          border: 1px solid #e2e8f0;
        }

        .wallet-input-group {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .wallet-input {
          flex: 1;
          padding: 0.65rem 1rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          font-size: 0.95rem;
          background: #ffffff;
          transition: border-color 0.2s ease;
        }

        .wallet-input:focus {
          outline: none;
          border-color: #1d4ed8;
        }

        .wallet-input:disabled {
          background: #f1f5f9;
          cursor: not-allowed;
        }

        .wallet-send-button {
          padding: 0.65rem 1.5rem;
          background: linear-gradient(135deg, #1d4ed8, #1e40af);
          color: #ffffff;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .wallet-send-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .wallet-send-button:not(:disabled):hover {
          transform: translateY(-1px);
        }

        .wallet-message {
          margin-top: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .wallet-message.success {
          background: rgba(74, 222, 128, 0.16);
          color: #047857;
        }

        .wallet-message.error {
          background: rgba(249, 112, 94, 0.16);
          color: #b91c1c;
        }

        .wallet-history-section {
          margin-top: 1rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 1rem;
        }

        .wallet-history-toggle {
          width: 100%;
          padding: 0.5rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: background 0.2s ease;
          text-align: left;
        }

        .wallet-history-toggle:hover {
          background: #e2e8f0;
        }

        .wallet-history-list {
          margin-top: 0.75rem;
          max-height: 300px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .wallet-history-item {
          padding: 0.75rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .wallet-history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .wallet-history-amount {
          font-weight: 700;
          color: #047857;
          font-size: 0.95rem;
        }

        .wallet-history-amount.commission {
          color: #b91c1c;
        }

        .wallet-history-date {
          font-size: 0.8rem;
          color: #64748b;
        }

        .wallet-history-details {
          display: flex;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: #475569;
        }

        .wallet-history-admin {
          font-size: 0.8rem;
          color: #94a3b8;
          font-style: italic;
        }

        .wallet-history-loading,
        .wallet-history-empty {
          padding: 1rem;
          text-align: center;
          color: #64748b;
          font-size: 0.9rem;
        }

        .delete-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .delete-modal {
          background: #ffffff;
          border-radius: 1rem;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.3);
        }

        .delete-modal h3 {
          margin: 0 0 1rem;
          font-size: 1.5rem;
          color: #dc2626;
        }

        .delete-warning {
          margin: 0 0 1rem;
          padding: 1rem;
          background: #fef2f2;
          border-left: 4px solid #dc2626;
          border-radius: 0.5rem;
          color: #991b1b;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .delete-instruction {
          margin: 1rem 0;
          color: #475569;
          font-size: 0.95rem;
        }

        .delete-instruction strong {
          color: #0f172a;
          font-weight: 700;
        }

        .delete-confirm-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          margin: 1rem 0;
          transition: border-color 0.2s ease;
        }

        .delete-confirm-input:focus {
          outline: none;
          border-color: #dc2626;
        }

        .delete-modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .delete-cancel {
          background: #f1f5f9;
          color: #475569;
          padding: 0.65rem 1.25rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .delete-cancel:hover {
          background: #e2e8f0;
        }

        .delete-confirm {
          background: #dc2626;
          color: #ffffff;
          padding: 0.65rem 1.25rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .delete-confirm:disabled {
          background: #fca5a5;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .delete-confirm:not(:disabled):hover {
          background: #b91c1c;
        }
      `}</style>
    </article>
  );
}


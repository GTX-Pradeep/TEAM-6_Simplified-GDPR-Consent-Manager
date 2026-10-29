
import { useEffect, useState } from "react";
import { getConsentHistory, type ConsentHistoryItem } from "../api/consents";

export default function HistoryPage() {
  const [history, setHistory] = useState<ConsentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        const items = await getConsentHistory();
        if (active) {
          setHistory(items);
        }
      } catch {
        if (active) {
          setError("Unable to load consent history. Please try again later.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <main><h1>Consent History</h1><p>Loading history...</p></main>;
  }

  if (error) {
    return (
      <main>
        <h1>Consent History</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Consent History</h1>
      <p>Review your previous consent decisions.</p>

      {history.length === 0 ? (
        <p>No consent history found.</p>
      ) : (
        <div>
          <table>
            <thead>
              <tr>
                <th scope="col">Date and time</th>
                <th scope="col">Purpose</th>
                <th scope="col">Action</th>
                <th scope="col">Policy version</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.recordedAt).toLocaleString()}</td>
                  <td>{item.purpose.name}</td>
                  <td>{item.action === "GRANTED" ? "Granted" : "Withdrawn"}</td>
                  <td>{item.policyVersion.versionNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

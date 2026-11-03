# Test reports (Deliverables Part 3, issue #25)

Executed on 03-11-2026 against the running system (React + Express + PostgreSQL) and the deployed site
https://gdpr-consent-manager.onrender.com.

| Report | What it shows |
|---|---|
| [Unit Test Report](Unit_Test_Report.pdf) | 225 automated tests (172 server, 53 client), all passing |
| [Code Coverage Report](Code_Coverage_Report.pdf) | statement / line / function coverage per layer and file |
| [Branch Coverage Report](Branch_Coverage_Report.pdf) | branch coverage per layer and file, list of uncovered branches |
| [System Validation Report](System_Validation_Report.pdf) | all 41 test cases of the Test Plan with evidence and screenshots, defects, deviations |
| [Test Plan v1.1](../03-Test-Plan/Simplified_GDPR_Consent_Manager_Test_Plan_Team6_v1.1.pdf) | revised test cases, actual results, RTM status |
| [Performance Test Report](../06-Quality/Performance_Test_Report.md) | k6 results for NFR-1, NFR-2, NFR-3 |

`raw/` holds the machine output: JUnit XML, HTML coverage reports (open `raw/server-coverage/index.html`), k6 summaries.

**Results:** 41/41 system test cases pass; 3 defects found during testing, all fixed and re-tested;
server coverage 95.7 % statements / 88.5 % branches, client 89.2 % / 85.3 %.

# Software Requirements Specification (SRS): Simplified GDPR Consent Manager
**Version:** 1.0  
**Status:** Initial Draft  

## 1. Introduction
### 1.1 Purpose
This document specifies the requirements for the Simplified GDPR Consent Manager, a tool designed to record user permissions, manage opt-in/opt-out flows, and maintain an immutable audit trail for compliance.

### 1.2 Scope
- User interface for giving and withdrawing consent.
- Backend tracking of consent versions and timestamps.
- Audit log storage for data protection verification.

## 2. User Roles
- **Data Subject (End-User):** Can view privacy policies, opt-in/opt-out of data processing categories, and modify preferences.
- **Administrator / DPO:** Can view audit logs and upload new privacy policy versions.

## 3. Functional Requirements
- **GDPR-F-001:** The system shall present clear opt-in checkboxes for distinct data processing purposes.
- **GDPR-F-002:** The system shall allow users to withdraw their consent at any time.
- **GDPR-F-003:** The system shall generate an unalterable timestamped log every time a user changes their consent status.
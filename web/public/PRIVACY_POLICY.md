# Privacy Policy for Paxly (Relationship OS)

**Effective Date:** October 25, 2026  
**Last Updated:** October 25, 2026  
**Version:** 3.0.0 (Production Certified)  

Welcome to **Paxly** ("Paxly", "we", "our", or "us"), operated as a dedicated Relationship Operating System designed for privacy, emotional intimacy, and trusted partnership. Your intimate digital world belongs exclusively to you and your partner. Privacy is not merely an optional feature in Paxly—it is the foundational architecture upon which every capability is engineered.

This Privacy Policy explains how Paxly collects, protects, processes, and respects your personal information when you use the Paxly mobile applications, web platforms, and associated services (collectively, the "Service").

---

## 1. Regulatory Compliance Framework

Paxly is engineered in strict compliance with leading global data privacy regulations:
* **Digital Personal Data Protection Act, 2023 (DPDP Act, India)**: Lawful, explicit, transparent processing, accessible consent withdrawal, and dedicated grievance redressal.
* **Information Technology Act, 2000 & Reasonable Security Practices Rules (India)**: Strict technical and organizational measures to safeguard sensitive personal data.
* **General Data Protection Regulation (GDPR / UK GDPR)**: Honoring the principles of data minimization, lawful processing, purpose limitation, integrity, confidentiality, and comprehensive Data Subject Rights (Articles 15–22).
* **California Consumer Privacy Act & California Privacy Rights Act (CCPA / CPRA)**: Providing full transparency, zero sale or sharing of personal data, and consumer opt-out protections.

---

## 2. Foundational Architectural Principles

1. **Zero Ad Targeting & Zero Commercial Data Brokering**: We do **not** sell, rent, monetize, trade, or license your personal data, intimate memories, emotional logs, voice notes, or chat transcripts to third-party advertisers, data brokers, or commercial syndicates.
2. **End-to-End Cryptography & Client-Side Security**: Intimate messages, voice whispers, and private vault media are safeguarded with client-side cryptographic keys derived on your device (using TweetNaCl and Web Crypto API). Paxly servers cannot view, inspect, or decrypt the contents of your end-to-end encrypted communications.
3. **Dual-Consent Relationship Sovereignty**: Intimate spaces require mutual trust. Actions involving the permanent export or downloading of shared intimate media to external device storage adhere to mutual dual-consent boundaries so neither partner's privacy is compromised without explicit permission.
4. **Physical Anti-Snooping Shields**: Native screen-privacy shields prevent unauthorized screen recording, third-party screengrabs, and system task-switcher leakage.

---

## 3. Information We Collect and How We Use It

### 3.1. Account & Identity Verification
* **Account Credentials**: Name, email address, password (securely salted and hashed using Argon2/bcrypt), generated cryptographic public keys, and optional profile avatars.
* **Purpose**: To authenticate your account, secure your sessions, prevent unauthorized account takeovers, and facilitate pairing with your partner.

### 3.2. Couple Space & Intimate Messaging
* **Real-Time Encrypted Messages**: Encrypted text messages, reactions, and voice notes transmitted over secure TLS 1.3 / WebSocket channels and stored encrypted at rest.
* **Message Editing**: When you edit your sent message, the updated text is synchronized and watermarked with an *"edited"* indicator to maintain transparency between partners. Partners can only edit their own sent messages.
* **Message Deletion**: Users have dual deletion options:
  * *Delete for Me*: Removes the message solely from your view, leaving your partner's view intact.
  * *Delete for Everyone*: Permanently deletes the message for both partners if executed by the original author.
* **Once-View Ephemeral Media**: Self-destructing photos and audio that automatically purge permanently from system buffers once viewed.

### 3.3. Fortress Security, App PIN & Intruder Detection
* **App PIN Protection**: 4-6 digit numeric PIN lock with instant local cryptographic validation (`crypto.subtle` SHA-256) cached on-device for zero-latency authentication.
* **Stealth Disguise Mode**: Disguises the app title (e.g. as "Notes") and provides an interactive functional Calculator disguise lock screen.
* **Intruder Selfie Defense**: If someone enters 3 consecutive incorrect PIN attempts:
  * The frontend silently captures a front-camera selfie of the unauthorized intruder.
  * The photo is securely logged in your private Security Logs (`/profile/settings?sub=logs`).
  * A real-time WebSocket security breach alert and persistent in-app notification are dispatched immediately to your verified partner with the intruder's photo.
* **Account & PIN Recovery**: Security verification using your master account password, custom security questions, or verified anniversary date.

### 3.4. Memory Vault & Dual-Consent Downloads
* **Digital Scrapbook & Milestones**: Photos, journal entries, bucket list items, and scheduled Love Notes with time-capsule countdown timers.
* **Dual-Consent Export Authorization**: To prevent non-consensual harvesting of private imagery, downloading shared intimate photos or memories to external device galleries requires sending an in-app download request (`vault_download_request`) that must be affirmatively authorized by your partner.

### 3.5. Aura AI Relationship Companion & Ask-First Crisis Protocol
Paxly provides **Aura AI** as an empathetic relationship coach and emotional wellness companion.
* **User-Initiated Sessions Only**: Aura operates strictly during user-directed chat sessions or structured counseling interviews. Aura does **not** passively listen to, monitor, or harvest ambient conversations for profiling.
* **Multi-Provider Fallback Architecture**: Aura utilizes secure API integrations (including Google Gemini and Groq) under zero-data-retention enterprise agreements. Sensitive personal identifiers and internal system prompts are strictly sanitized and masked before transmission.
* **Ask-First Crisis Safety Protocol**:
  * In the critical event that Aura detects an imminent self-harm or suicidal crisis signal (`RISK_4`), Paxly provides crisis helpline resources (988, 112, Vandrevala Foundation) and—depending on your configured safety setting—can deliver a generic care notice to your verified partner.
  * **Strict Safety Guarantees**:
    1. **Zero Transcript Disclosure**: Safety alerts *never* include message contents, chat quotes, transcripts, or confidential prompts.
    2. **Generic Notice Only**: Communicates solely that emotional check-in support is recommended (e.g., *"Aura noticed your partner may need emotional care"*).
    3. **Verified Recipient Only**: Dispatched exclusively to your currently linked, authenticated partner.
    4. **User Preference Modes**: Configurable in Settings between `Ask first` (consent prompt before notifying), `Pre-authorized`, or `Off` (suppressing all outbound alerts).
    5. **Duplicate Suppression**: Enforces a strict 15-minute cooldown to prevent alert flooding.

### 3.6. Milestone & Anniversary Tracking
* Track anniversaries, milestone countdowns, and upcoming celebrations. Automated local reminders are triggered at 30 days, 7 days, 1 day, and on the milestone day.

### 3.7. Payment & Premium Transactions
* Purchases for Love Shop gifts or Premium memberships are processed through certified PCI-DSS Level 1 compliant gateways (Razorpay, Stripe). Paxly **never** stores or processes full credit or debit card numbers on our infrastructure.

---

## 4. How We Share Information

We share your information strictly under the following limited conditions:
1. **With Your Verified Partner**: Messages, approved vault media, mood resonance, and shared dates are shared only with the partner linked through your mutual pairing code.
2. **Infrastructure Processors**: Trusted cloud infrastructure providers (e.g., encrypted database hosting on Supabase/PostgreSQL, cloud servers on Render) operating under strict Data Processing Agreements (DPAs) mandating SOC2, ISO 27001, and GDPR compliance.
3. **Legal Requirements & Life Safety**: In the rare event of a valid court order, search warrant, statutory subpoena, or to prevent imminent death or severe bodily harm as permitted by applicable law.

We do **not** sell, lease, or syndicate user data under any circumstances.

---

## 5. Your Rights as a Data Principal / User

Under the DPDP Act 2023, GDPR, and CCPA, you retain full sovereignty over your personal data:
* **Right to Access & Data Portability**: Download your complete joint history, chat records, and scrapbook memories at any time via **Settings > Export Memories** in machine-readable JSON format (`paxly_history.json`).
* **Right to Rectification**: Correct or update your display name, password, security questions, or dates directly in Settings.
* **Right to Erasure (Right to be Forgotten)**: You may request permanent deletion of your account. Following account deletion, personal identifiers and user data are permanently wiped from active servers within 30 days.
* **Right to Withdraw Consent**: Unlink from your partner, turn off Aura AI safety escalations, disable intruder logs, or clear local storage at any time.
* **Right to Nominate**: In accordance with the Indian DPDP Act, you have the right to nominate a trusted representative to exercise your data rights in the event of death or incapacity.

---

## 6. Data Security & Storage Architecture

* **Encryption in Transit & at Rest**: All network communications enforce TLS 1.3 with Perfect Forward Secrecy. Server databases, media storage, and backups are encrypted using AES-256.
* **Screen Recording & Capture Defense**: Mobile and web wrappers enforce hardware-level privacy flags preventing screenshotting, third-party screen scraping, and OS background app previews.
* **Local Cryptographic Storage**: Local storage is restricted strictly to authenticated session tokens (`ros_token`), client encryption keys, and salted PIN hashes. Logging out purges all cached credentials and sensitive drafts immediately.

---

## 7. Memory Guarantee vs. Account Closure

Paxly understands that relationships evolve:
* **Eternity Memory Guarantee**: Upon requesting closure, partners can choose to archive shared scrapbooks in a locked, read-only encrypted vault, ensuring cherished relationship milestones remain protected if reconciliation occurs.
* **Statutory Permanent Erasure**: If complete removal is preferred, both partners may request irreversible erasure, purging all shared records and account identifiers within 30 days.

---

## 8. Age Restriction (18+ Only)

Paxly is strictly built for **consenting adults aged 18 years and older** (or the age of legal majority in your country). We do not knowingly collect or solicit personal data from minors under 18. Any account discovered to belong to a minor will be terminated immediately.

---

## 9. Contact & Grievance Officer

To exercise your privacy rights, file a grievance, or ask questions regarding data processing, contact our designated Data Protection Officer:

* **Designated Grievance & Data Protection Officer**: Privacy Operations Team, Paxly
* **Direct Email**: `privacy@paxly.app`
* **Alternate Legal Email**: `legal@paxly.app`
* **Response Commitment**: All requests are acknowledged within 24 hours and addressed within 7 business days under statutory standards.

# Cookie & Local Storage Policy for Paxly (Relationship OS)

**Effective Date:** October 25, 2026  
**Last Updated:** October 25, 2026  
**Version:** 3.0.0 (Production Certified)  

Welcome to **Paxly** ("Paxly", "we", "our", or "us"). We believe in absolute data dignity and transparency. Unlike mainstream social media applications, **Paxly does not use tracking cookies, commercial ad pixels, or behavioral monitoring beacons**.

This Cookie & Local Storage Policy explains what local technologies we use, why we use them, and how you have full control over them.

---

## 1. Our Zero-Tracking Guarantee

* **No Advertising Cookies**: We do **not** partner with advertising networks (e.g., Google AdSense, Meta/Facebook Pixel, TikTok Pixel, or Criteo).
* **No Cross-Site Tracking**: We never track your browsing behavior across other websites or apps.
* **No Third-Party Analytics Trackers**: We do not inject invasive third-party telemetry scripts that record keystrokes, screenshots, or screen recordings.

---

## 2. What Local Technologies We Use

Paxly utilizes modern, secure **Web Storage APIs (Local Storage & Session Storage)** and temporary in-memory buffers strictly to deliver essential app functions and cryptographic security:

| Key / Identifier | Storage Type | Purpose & Description | Lifespan |
| :--- | :--- | :--- | :--- |
| `ros_token` | Local Storage | Encrypted JSON Web Token (JWT) used strictly to authenticate your active session with Paxly servers over TLS 1.3. | Session / Until Logout |
| `ros_user` | Local Storage | Basic user metadata (name, email, pairing status) used for instant UI initialization without screen flicker. | Session / Until Logout |
| `paxly_pin_hash` | Local Storage | Cryptographically salted SHA-256 hash of your 4-6 digit App PIN. Enables instant (<1ms) local fortress unlock on your device without sending plain PINs over the internet. | Until PIN Change / Logout |
| `tweetnacl_keys` | Memory / Local Storage | Client-side cryptographic key pairs (derived via TweetNaCl and Web Crypto API) used for encrypting and decrypting messages and vault media on your device. | Persistent / Until Logout |
| `cached_notifications` | Local Storage | Transient local cache of recent notifications to ensure fast offline loading and unread count badges. | Automatically refreshed |
| `aura_settings` | Local Storage | Your configured preferences for Aura AI (tone, frequency, and Ask-First crisis mode). | Until changed |

---

## 3. Why These Technologies Are Essential

Under the **EU ePrivacy Directive (Article 5(3))**, the **GDPR**, and the **Indian DPDP Act 2023**, strictly essential technical storage used solely for facilitating communications or providing a service explicitly requested by the user does not require consent popups. 

In Paxly:
1. **Authentication**: Without `ros_token`, you would have to type your password on every page click.
2. **End-to-End Cryptography**: Without local key storage, client-side encryption and private decryption of your partner's messages would be mathematically impossible.
3. **Local App Fortress**: Storing the salted PIN hash locally ensures that your phone locks immediately and unlocks securely even when you are on airplane mode or offline.

---

## 4. How to Manage and Purge Your Data

You have complete control over your local device storage at any time:

1. **In-App Safe Logout**: Clicking **Settings > Log Out** automatically purges your authentication tokens, encryption keys, cached notifications, and local drafts from your browser or device storage.
2. **Browser Storage Clear**: You can manually clear Paxly's local storage at any time in your browser settings (*Developer Tools > Application > Local Storage > Clear All*, or *Browser Settings > Privacy & Security > Clear Cookies and Site Data*).
3. **Exporting Your Data**: You can download all your stored memories and account data before clearing by clicking **Settings > Export Memories** (`paxly_history.json`).

---

## 5. Contact Us

If you have any questions or feedback regarding our Cookie and Local Storage practices, please contact:

* **Privacy & Security Team**: Paxly Compliance Office
* **Email**: `privacy@paxly.app`
* **Legal Inquiries**: `legal@paxly.app`

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// Derive a 32-byte key from password + salt (email) using PBKDF2
export async function deriveKeyFromPassword(password, saltString) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const salt = enc.encode(saltString.toLowerCase().trim());
  
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256 // 32 bytes = 256 bits
  );

  return new Uint8Array(derivedBits);
}

// Generate keypair from derived key
export function generateKeyPair(derivedKey) {
  const keyPair = nacl.box.keyPair.fromSecretKey(derivedKey);
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey)
  };
}

// Encrypt text message for partner
export function encryptMessage(text, mySecretKeyBase64, partnerPublicKeyBase64) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = naclUtil.decodeUTF8(text);
  const partnerPubUint8 = naclUtil.decodeBase64(partnerPublicKeyBase64);
  const mySecretUint8 = naclUtil.decodeBase64(mySecretKeyBase64);

  const encrypted = nacl.box(messageUint8, nonce, partnerPubUint8, mySecretUint8);
  
  const fullMessage = new Uint8Array(nonce.length + encrypted.length);
  fullMessage.set(nonce);
  fullMessage.set(encrypted, nonce.length);
  
  return naclUtil.encodeBase64(fullMessage);
}

// Decrypt text message from partner
export function decryptMessage(boxBase64, mySecretKeyBase64, partnerPublicKeyBase64) {
  try {
    const messageWithNonceAsUint8Array = naclUtil.decodeBase64(boxBase64);
    const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength);
    const message = messageWithNonceAsUint8Array.slice(
      nacl.box.nonceLength,
      messageWithNonceAsUint8Array.length
    );

    const partnerPubUint8 = naclUtil.decodeBase64(partnerPublicKeyBase64);
    const mySecretUint8 = naclUtil.decodeBase64(mySecretKeyBase64);

    const decrypted = nacl.box.open(message, nonce, partnerPubUint8, mySecretUint8);

    if (!decrypted) {
      throw new Error("Could not decrypt message");
    }

    return naclUtil.encodeUTF8(decrypted);
  } catch(e) {
    // If decryption fails, it might be a plaintext legacy message.
    console.warn("E2E Decryption failed (might be legacy plaintext)");
    return boxBase64;
  }
}

// Symmetric encryption for media blobs
export function encryptMediaBlob(blob) {
   return new Promise(async (resolve) => {
       const key = nacl.randomBytes(nacl.secretbox.keyLength);
       const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
       
       const arrayBuffer = await blob.arrayBuffer();
       const uint8Array = new Uint8Array(arrayBuffer);
       
       const encrypted = nacl.secretbox(uint8Array, nonce, key);
       const fullMessage = new Uint8Array(nonce.length + encrypted.length);
       fullMessage.set(nonce);
       fullMessage.set(encrypted, nonce.length);
       
       const encryptedBlob = new Blob([fullMessage], { type: 'application/octet-stream' });
       const keyBase64 = naclUtil.encodeBase64(key);
       
       resolve({ encryptedBlob, symmetricKey: keyBase64 });
   });
}

// Symmetric decryption for media blobs
export function decryptMediaBlob(encryptedBlob, symmetricKeyBase64) {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await encryptedBlob.arrayBuffer();
            const messageWithNonceAsUint8Array = new Uint8Array(arrayBuffer);
            
            const nonce = messageWithNonceAsUint8Array.slice(0, nacl.secretbox.nonceLength);
            const message = messageWithNonceAsUint8Array.slice(nacl.secretbox.nonceLength);
            const key = naclUtil.decodeBase64(symmetricKeyBase64);
            
            const decrypted = nacl.secretbox.open(message, nonce, key);
            if (!decrypted) throw new Error("Media decryption failed");
            
            const blob = new Blob([decrypted]);
            resolve(blob);
        } catch(e) {
            reject(e);
        }
    });
}

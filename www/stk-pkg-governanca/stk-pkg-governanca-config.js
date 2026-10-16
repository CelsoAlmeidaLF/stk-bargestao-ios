/**
 * stk-pkg-governanca — configuração pública do projeto Firebase da Governança (systekna-feedback).
 * apiKey, appId e a chave do reCAPTCHA Enterprise são identificadores públicos de projeto, não segredos:
 * quem protege os dados são as regras do Firestore e o App Check.
 */
export const GOVERNANCA_FIREBASE = Object.freeze({
  projectId: 'systekna-feedback',
  apiKey: 'AIzaSyCQx8kJyXEReASiQMI4a5bT5NNWgtBmJpM',
  authDomain: 'systekna-feedback.firebaseapp.com',
  appId: '1:870927975015:web:0576bd5e3cdd8d067d8ac2',
  recaptchaSiteKey: '6LehydgtAAAAAOqkwKOQPzg2m0CZwYTRZSXPeyyx',
  sdkBase: 'https://www.gstatic.com/firebasejs/10.14.1/',
  firestoreHost: 'https://firestore.googleapis.com'
});

/** Origens que a CSP do app precisa liberar para falar com a governança. */
export const GOVERNANCA_CSP = Object.freeze({
  scriptSrc: ['https://www.gstatic.com', 'https://www.google.com'],
  connectSrc: ['https://firestore.googleapis.com', 'https://content-firebaseappcheck.googleapis.com', 'https://www.google.com'],
  frameSrc: ['https://www.google.com']
});

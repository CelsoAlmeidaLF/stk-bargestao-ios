/**
 * Adaptador de UI: senhas e PINs da equipe só digitados (padrão Systekna, kit stk-pkg-security).
 * Sem colar, arrastar nem preenchimento automático (Proton Pass, Google); o navegador não oferece salvar.
 * A proteção vem do kit (window.FinancTyped.only); aqui ficam a lista de campos e a leitura conferida.
 */
export const TYPED_SECRET_FIELDS = Object.freeze({
  // id do campo: true = só números (PIN, vira texto mascarado), false = senha
  'login-secret': false,
  'setup-confirm': false,
  'pin-current-password': false,
  'pin-new': true,
  'pin-confirm': true,
  'change-old': false,
  'change-new': false,
  'change-confirm': false,
  'recover-password': false,
  'recover-confirm': false,
  'novo-user-senha': false,
  'reauth-secret': false
});

export const NOT_TYPED_MESSAGE = 'Digite a senha ou o PIN no teclado: colar e preenchimento automático não são aceitos.';

/** Aplica a proteção do kit nos campos da equipe. @returns {number} quantos campos foram protegidos */
export function protectTypedSecrets(doc = document, typed = globalThis.FinancTyped) {
  if (!typed?.only) throw new Error('Kit de segurança Systekna não carregado.');
  let count = 0;
  for (const [id, digits] of Object.entries(TYPED_SECRET_FIELDS)) {
    const input = doc.getElementById(id);
    if (!input || input._typedProtected) continue;
    typed.only(input, digits);
    input._typedProtected = true;
    count++;
  }
  return count;
}

/** Valor do campo, recusado se não foi digitado (posto por fora, depois da última tecla). */
export function typedValue(id, doc = document) {
  const input = doc.getElementById(id);
  if (!input) return undefined;
  if (input._typedProtected && input.value !== input._typed) throw new Error(NOT_TYPED_MESSAGE);
  return input.value;
}

/** Limpa o campo e o registro do que foi digitado. */
export function clearTyped(input) {
  if (!input) return;
  input.value = '';
  if (input._typedProtected) input._typed = '';
}

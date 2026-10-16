/**
 * Porta de Saída: Governança Systekna (Firebase)
 * Contrato do canal entre o app e o Painel de Governança (docs 12 e 13).
 */
export class IGovernancePort {
  submitRegistration(id, registration) { throw new Error('Não implementado'); }
  fetchRegistration(id) { throw new Error('Não implementado'); }
  fetchTenant(id) { throw new Error('Não implementado'); }
  reportError(id, report) { throw new Error('Não implementado'); }
  sendFeedback(id, feedback) { throw new Error('Não implementado'); }
}

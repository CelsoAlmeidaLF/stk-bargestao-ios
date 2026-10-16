import { FirestoreRestGovernanca, codificarCampos, codificarValor, decodificarCampos, decodificarValor } from '../../../stk-pkg-governanca/stk-pkg-governanca-firestore.js';

/**
 * Adaptador REST do Firestore para a Governança Systekna (IGovernancePort).
 * O canal é o do pacote stk-pkg-governanca (App Check, esquema das regras, ids validados);
 * aqui ficam só os nomes da porta do BarGestão.
 */
export class FirebaseGovernanceAdapter extends FirestoreRestGovernanca {
  submitRegistration(id, registration) { return this.enviarSolicitacao(id, registration); }
  fetchRegistration(id) { return this.buscarSolicitacao(id); }
  fetchTenant(id) { return this.buscarTenant(id); }
  reportError(id, report) { return this.enviarErro(id, report); }
  sendFeedback(id, feedback) { return this.enviarFeedback(id, feedback); }

  static encodeValue(v) { return codificarValor(v); }
  static encodeFields(obj) { return codificarCampos(obj); }
  static decodeValue(v) { return decodificarValor(v); }
  static decodeFields(fields) { return decodificarCampos(fields); }
}

import { AppCheckGovernanca } from '../../../stk-pkg-governanca/stk-pkg-governanca-firestore.js';

/**
 * Adaptador de App Check (reCAPTCHA Enterprise) do projeto da governança.
 * O Firestore exige App Check: sem o token, toda leitura/gravação volta HTTP 403.
 * Implementação e configuração pública vêm do pacote stk-pkg-governanca.
 */
export class FirebaseAppCheckAdapter extends AppCheckGovernanca {}

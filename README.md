# BarGestão · app iOS (Capacitor)

> **Arquivado em 16/10/2026:** a alternativa iOS foi retirada do PILOTO-02. O projeto fica aqui, somente leitura, para retomar o iOS no futuro (precisa de um Mac ou do GitHub Actions liberado, e de conta Apple Developer para distribuir). Nenhum build foi gerado.

O **BarGestão Standard** (PWA `stk-app-multi-cm`, v2.8.0) como app de **iPhone**, com o mesmo código do [app Android em Capacitor](https://github.com/CelsoAlmeidaLF/stk-bargestao-capacitor): dados do bar num banco **SQLite** no aparelho, nada no armazenamento do navegador, **Governança Systekna online**.

## Baixar

- **[Releases](https://github.com/CelsoAlmeidaLF/stk-bargestao-ios/releases/latest)**:
  - `BarGestao-ios-sem-assinatura.ipa` — para iPhone (precisa reassinar, veja abaixo);
  - `BarGestao-ios-simulador.zip` — para o Simulador do Xcode, no Mac.

### Por que "sem assinatura"

O iPhone só instala apps assinados por um certificado da Apple. Este build sai **sem assinatura** porque o projeto ainda não tem conta **Apple Developer**. Para instalar:

- **Sideloadly** ou **AltStore** (Windows/Mac): abra o `.ipa`, entre com o seu Apple ID e instale no iPhone conectado. Com Apple ID gratuito, o app vale por **7 dias** (depois, reinstale); no iPhone, confie no desenvolvedor em *Ajustes › Geral › VPN e Gerenciamento de Dispositivos*.
- **Simulador (Mac):** descompacte o `.zip` e arraste o `App.app` para o Simulador do Xcode.

Para distribuir de verdade (amigos e clientes): conta **Apple Developer** → certificado e perfil de distribuição como *secrets* do repositório → o workflow assina e envia ao **TestFlight** / App Store.

## Como é montado

- `www/`: a edição móvel do PWA, montada no projeto Capacitor (`../capacitor`: PWA + `patches/pwa-local.patch` + `local/`). Fica versionada aqui porque o build roda num Mac do GitHub, sem o PWA ao lado. Atualizar: `scripts/atualizar-www.sh`.
- `ios/`: projeto Xcode gerado pelo Capacitor 8 (plugins pelo **Swift Package Manager**: SQLite, Filesystem e Share), com nome **BarGestão**, ícone e abertura do BarGestão, versão 2.8.0 e acesso aos arquivos pelo app **Arquivos** (*No meu iPhone › BarGestão*: backups, relatórios e frase).
- `.github/workflows/build-ios.yml`: num Mac (`macos-15`), `npm ci` → `cap sync ios` → `xcodebuild` para iPhone (sem assinatura) e para o Simulador → artefatos e Release `v2.8.0-ios`.

O iOS **só compila no macOS** (Xcode): por isso o build é no GitHub Actions, não na máquina Linux de desenvolvimento.

## Governança no iOS (App Check)

O Firestore da governança exige App Check (reCAPTCHA Enterprise), que confere o domínio da página. No iOS o app roda como `capacitor://celsoalmeidalf.github.io` (o WKWebView não permite `https` para arquivos do próprio app). Se o reCAPTCHA não aceitar esse endereço, a alternativa é o **App Attest** da Apple (App Check nativo), que exige registrar o app iOS no Firebase. A confirmação é no iPhone.

## Licença

Proprietária, todos os direitos reservados. Veja [LICENSE](LICENSE).

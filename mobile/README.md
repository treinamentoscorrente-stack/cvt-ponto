# CVT Ponto Mobile

Aplicativo móvel do funcionário, construído com Capacitor 8 + React/Vite.

## Segurança

- O app não acessa o PostgreSQL diretamente.
- Toda regra de ponto permanece na API Next.js da CVT.
- O app usa access token curto e refresh token rotativo.
- Tokens são armazenados no Keychain (iOS) / Android Keystore pelo plugin de secure storage.
- A hora da batida continua sendo definida pelo servidor.
- O app não usa `server.url` do Capacitor em produção.
- O plugin Capacitor HTTP fica habilitado para requisições HTTPS nativas.

## Desenvolvimento

1. Entre na pasta:

```bash
cd mobile
```

2. Instale as dependências:

```bash
npm install
```

3. Copie o ambiente:

```bash
cp .env.example .env
```

4. Em `.env`, informe a URL HTTPS de produção/homologação da API:

```text
VITE_CVT_API_URL=https://SEU-DOMINIO
```

5. Gere os projetos nativos uma única vez:

```bash
npm run cap:add:android
npm run cap:add:ios
```

6. Sincronize alterações:

```bash
npm run cap:sync
```

## Abrir projeto

Android:

```bash
npm run android
```

iOS:

```bash
npm run ios
```

Para iOS é necessário macOS com Xcode. Para Android é necessário Android Studio.

## Primeira versão

A primeira etapa do app inclui:

- login de funcionário;
- renovação segura da sessão;
- banco de horas;
- situação da jornada do dia;
- horários registrados no dia;
- registro de Entrada, Início do intervalo, Fim do intervalo e Saída;
- logout com revogação da sessão.

Próximas etapas previstas:

- solicitação de ajuste de ponto;
- lançamento de horas adicionais;
- históricos completos;
- biometria para desbloqueio local;
- notificações push.

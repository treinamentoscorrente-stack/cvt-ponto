# CVT Controle de Ponto

Aplicação interna de controle de jornada da Corrente da Vida Treinamentos.

**Stack:** Next.js 16.3.6 + React 19.3 + TypeScript + PostgreSQL (Neon).

## Funcionalidades

- Login administrativo e de funcionário.
- Cadastro, edição, ativação/inativação e redefinição de senha de funcionários.
- Registro de Entrada, Início do intervalo, Fim do intervalo e Saída.
- Horário e tipo da batida definidos pelo servidor.
- Jornada padrão de 8 horas em dias úteis.
- Feriados, faltas, folgas integrais/parciais e atestados.
- Solicitação de ajuste de ponto pelo funcionário com aprovação do administrador.
- Notificação de ajustes pendentes no painel administrativo.
- Lançamento confirmado de horas adicionais diretamente no banco de horas.
- Banco de horas geral e consulta mensal por funcionário.
- Dashboard administrativo.
- Relatório mensal, CSV e PDFs de relatório/cartão ponto.
- Auditoria das principais operações.

## Regras principais

- Sábado, domingo e feriado têm previsão de 0h.
- Falta gera débito de 8h.
- Folga debita o banco conforme o período lançado.
- Atestado não reduz o banco de horas.
- Horas adicionais confirmadas entram como saldo positivo.
- Ajustes solicitados pelo funcionário só alteram o ponto após aprovação administrativa.
- Jornada incompleta não cria saldo artificial.

As regras detalhadas estão em `docs/REGRAS-JORNADA.md`.

## Segurança

- Senhas armazenadas com `scrypt` e salt individual.
- Sessões aleatórias persistidas no PostgreSQL.
- Cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Validação de origem e proteção de operações de escrita.
- Rate limiting persistido para login.
- SQL parametrizado.
- Transações e locks nas operações críticas.
- Funcionário acessa apenas os próprios dados.
- Funcionário inativado perde a sessão.
- Auditoria de operações administrativas e registros de jornada.
- Cabeçalhos de segurança configurados no Next.js.

## Banco de dados

A aplicação requer `DATABASE_URL`.

Para migrações, `DB_MIGRATION_URL` pode apontar para uma conexão direta/unpooled do Neon.

As migrações em `db/migrations/` fazem parte do histórico técnico do sistema e devem ser preservadas.

### Ambiente local com Docker

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:migrate
npm run db:seed-admin
npm run dev
```

## Administrador

O código não contém senha administrativa fixa.

Para o bootstrap inicial, use `ADMIN_LOGIN` e `ADMIN_PASSWORD` apenas no ambiente da execução do seed. Depois da criação do administrador, a variável de senha inicial não deve permanecer configurada sem necessidade.

## Validação

Antes de publicar alterações:

```bash
npm run doctor
npm run typecheck
npm run build
```

## Deploy

O repositório está conectado à Vercel e as alterações da branch de produção são publicadas pelo fluxo Git.

A arquitetura de produção é:

```text
Browser -> Next.js/Vercel -> API Routes -> Neon PostgreSQL
```

Consulte `docs/DEPLOY-VERCEL-NEON.md` para procedimentos de implantação e manutenção.

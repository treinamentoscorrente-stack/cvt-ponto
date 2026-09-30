# CVT Controle de Ponto — versão definitiva

Aplicação interna de controle de jornada da Corrente da Vida Treinamentos.

**Stack:** Next.js 16.3.6 + React 19.3 + TypeScript + PostgreSQL (Neon-ready).

## Funcionalidades

- Login Empresa e Funcionário.
- Cadastro inicial de até 3 funcionários.
- Ativo/inativo.
- Sequência obrigatória: Entrada -> Início do intervalo -> Fim do intervalo -> Saída.
- Horário e tipo da batida definidos pelo servidor.
- Jornada padrão de 8 horas em dias úteis.
- Sábado, domingo e feriado com previsão 0h.
- Jornada incompleta sem inventar saldo.
- Horas trabalhadas, positivas, negativas e saldo.
- Dashboard e relatório mensal.
- Exportação CSV/Excel e impressão/PDF.

## Segurança

- Senhas com `scrypt` + salt individual.
- Sessões aleatórias persistidas no PostgreSQL.
- Cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- CSRF em operações de escrita.
- Rate limiting de login persistido no banco.
- SQL parametrizado.
- Transação + lock no registro de ponto.
- Funcionário só acessa os próprios dados.
- Funcionário inativado perde a sessão.
- Auditoria de logins, cadastro, alteração de status e batidas.
- Cabeçalhos CSP e demais headers de segurança.

## Banco

A aplicação requer `DATABASE_URL`.

Para Neon/Vercel, use a conexão fornecida pela integração. Para migrações, `DB_MIGRATION_URL` pode apontar para uma conexão direta/unpooled.

### Local com Docker

```bash
docker compose up -d
cp .env.example .env.local
```

Preencha `DATABASE_URL` e então:

```bash
npm install
npm run db:migrate
npm run db:seed-admin
npm run dev
```

## Administrador

O código **não contém senha administrativa fixa**.

No primeiro seed, use login `CVT` e informe a senha desejada. Se quiser automatizar o bootstrap, defina temporariamente `ADMIN_LOGIN` e `ADMIN_PASSWORD` no ambiente da execução.

Use uma senha exclusiva e forte em produção. Não reutilize senhas de protótipo ou já compartilhadas.

## Validação

```bash
npm run doctor
npm run typecheck
npm run build
```

## Deploy

Veja `docs/DEPLOY-VERCEL-NEON.md`.

### Nota de versão

Em 29/09/2026, Next.js 16.3.6 é o patch Active LTS publicado após o update crítico de 22/09. Há uma atualização de segurança 16.3.7 anunciada para 30/09/2026; atualizar antes da entrada em produção.


## Vercel / Neon

O projeto está preparado para Vercel Functions em São Paulo (`gru1`), junto ao projeto Neon da CVT em `aws-sa-east-1`.

A conexão com o banco é inicializada de forma lazy: o build do Next.js não falha apenas porque `DATABASE_URL` ainda não foi injetada. Em runtime, a API exige `DATABASE_URL`.

Para publicação sem Git, use o Vercel Drop (`https://vercel.com/drop`) com a pasta descompactada. Nunca inclua `.env.local` ou credenciais no upload.

Variáveis mínimas de produção:

```text
DATABASE_URL=<pooled Neon connection string>
ADMIN_LOGIN=CVT
ADMIN_PASSWORD=<segredo apenas para o seed inicial>
```

No primeiro login administrativo, se a tabela `admins` estiver vazia, a aplicação cria o administrador usando `ADMIN_LOGIN` e `ADMIN_PASSWORD`, armazenando apenas hash + salt no banco. Depois do primeiro login bem-sucedido, remova `ADMIN_PASSWORD` da Vercel e faça um novo deploy.


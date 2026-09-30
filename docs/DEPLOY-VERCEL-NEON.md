# Deploy: Vercel + Neon

## Arquitetura

Browser -> Next.js/Vercel -> API routes -> Neon PostgreSQL

O browser nunca recebe `DATABASE_URL`, hashes de senha ou credenciais do banco.

## Ordem segura de implantação

1. Criar/conectar o projeto Vercel.
2. Provisionar Neon e conectar ao projeto Vercel.
3. Confirmar que `DATABASE_URL` existe nos ambientes necessários.
4. Para migrações, preferir uma URL direta/unpooled em `DB_MIGRATION_URL` quando o Neon fornecer uma.
5. Executar `npm run db:migrate`.
6. Criar o administrador com `ADMIN_LOGIN` e `ADMIN_PASSWORD` definidos somente no ambiente da execução e rodar `npm run db:seed-admin`.
7. Remover `ADMIN_PASSWORD` do ambiente após o seed, se ele não for mais necessário.
8. Executar `npm run typecheck` e `npm run build`.
9. Fazer deploy de Preview.
10. Testar login empresa -> cadastro funcionário -> login funcionário -> 4 batidas -> relatório mensal.
11. Somente após os testes, promover para produção.

## Variáveis

- `DATABASE_URL` — conexão PostgreSQL usada pela aplicação.
- `DB_MIGRATION_URL` — opcional, conexão direta para migração.
- `ADMIN_LOGIN` — usado apenas no bootstrap do administrador.
- `ADMIN_PASSWORD` — usado apenas no bootstrap; nunca deve ser commitado.

## Vercel CLI (quando disponível)

```bash
vercel link
vercel integration add neon
vercel env pull .env.local --yes
npm run db:migrate
ADMIN_LOGIN=CVT ADMIN_PASSWORD='uma-senha-forte' npm run db:seed-admin
npm run typecheck
npm run build
vercel deploy
```

Use o Preview para testes. Depois de validar:

```bash
vercel promote <preview-url>
```

## Segurança

- Não cadastrar `DATABASE_URL` como `NEXT_PUBLIC_*`.
- Não colocar senha administrativa no repositório.
- Não executar migrações automaticamente em toda inicialização da aplicação.
- Preview e Production devem, idealmente, usar branches/bancos separados.

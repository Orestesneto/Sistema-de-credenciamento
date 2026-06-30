# Sistema de Credenciamento

Sistema web para credenciamento de eventos, cadastro de participantes, emissao de QR Code e check-in por leitura de QR Code, codigo ou WhatsApp.

## Funcionalidades

- Cadastro de participantes com nome, WhatsApp e data de nascimento.
- Login para recuperar o QR Code do participante.
- Envio de link do QR Code para o WhatsApp do participante.
- Perfil exclusivo para administrar o evento.
- Cadastro de equipe de check-in.
- Painel de usuarios cadastrados com exclusao de usuario.
- Check-in por camera, codigo da credencial ou WhatsApp.
- Controle para parar ou liberar novos registros.
- Sessao unica por usuario: ao entrar em outra tela, a sessao anterior e invalidada.

## Requisitos

- Node.js 20 ou superior.
- NPM.
- Projeto Supabase, para uso em producao.

## Instalar

```bash
npm install
```

## Configurar variaveis

Crie um arquivo `.env.local` baseado em `.env.example`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SESSION_SECRET=troque-por-um-segredo-grande
```

No Supabase, execute o SQL de `supabase-schema.sql`.

## Rodar localmente

```bash
npm start
```

Depois acesse:

```text
http://localhost:3000
```

Se as variaveis do Supabase nao estiverem configuradas, o sistema usa arquivos locais em `data/`.

## Publicar na Vercel

O projeto possui `vercel.json` apontando para `server.js`.

Configure as variaveis de ambiente na Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

Depois publique:

```bash
npx vercel --prod --yes
```

## Dados e seguranca

Arquivos com dados reais e credenciais nao devem ser versionados.

O `.gitignore` ja ignora:

- `.env*`, exceto `.env.example`
- `.vercel/`
- `node_modules/`
- `data/*.json`
- `data/uploads/`

## Perfil exclusivo

O acesso exclusivo e definido em `server.js`, na constante `EXCLUSIVE_ACCESS`.

Use esse perfil para:

- cadastrar equipe de check-in;
- excluir usuarios;
- abrir ou fechar registros;
- visualizar usuarios cadastrados.

## Observacoes

O WhatsApp nao permite anexar automaticamente uma imagem por link web sem acao do usuario. Por isso, o botao de envio abre a conversa com mensagem preenchida contendo o codigo e o link direto da imagem PNG do QR Code.

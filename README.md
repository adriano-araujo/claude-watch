# Claude Watch

Aprove ou rejeite ações do Claude Code pelo celular.

Um hook do CC + daemon + PWA que permite monitorar sessões e responder aprovações remotamente, via Tailscale.

## Como funciona

Por padrão o hook não faz nada. Quando você liga o **Remote ON** no app, tools que normalmente pedem confirmação no terminal passam a ser aprovadas pelo celular.

```
Claude Code → Hook → Daemon → PWA (celular)
                                ↓
                            Approve / Deny
```

## Setup

```bash
# Instalar dependências e buildar
npm install
npm run build

# Instalar o hook globalmente
npm install -g ./packages/hook

# Registrar o hook no ~/.claude/settings.json
node scripts/setup.js

# Iniciar o daemon
node packages/daemon/dist/server.js
```

O daemon exibe um PIN de 6 dígitos. Abra o app no celular e pareie com esse PIN.

## Desenvolvimento

```bash
# Daemon (porta 3100)
node packages/daemon/dist/server.js

# App Angular (porta 4500)
cd packages/app && npx ng serve --port 4500
```

## Estrutura

```
packages/
  shared/   → Tipos e lógica de permissões
  hook/     → CLI claude-remote-hook (PreToolUse)
  daemon/   → Servidor Fastify (SSE + API)
  app/      → Angular PWA
```

## Requisitos

- Node.js 22+
- Tailscale (para acesso remoto)

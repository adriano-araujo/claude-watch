# Claude Watch

Aplicativo PWA para monitorar e interagir com sessões do Claude Code remotamente pelo celular.

## Problema

O Claude Code frequentemente pausa esperando confirmação do usuário (aprovações de ferramentas, inputs).
Se o usuário não está olhando o terminal, a sessão fica travada sem necessidade.

## Solução

Um daemon rodando no notebook que expõe o estado das sessões do CC via SSE,
e um PWA no celular que consome esses eventos e permite interação.

O sistema tem um **modo remoto sob demanda**: por padrão o hook não interfere em nada.
O usuário ativa o modo remoto pelo app quando quiser aprovar ações pelo celular.

## Arquitetura

```
┌──────────┐   Hook HTTP   ┌──────────┐    SSE     ┌──────────┐
│  Claude   │ ───────────→  │  Daemon  │ ────────→  │  Celular │
│   Code    │               │ (Node.js)│ ←────────  │  (PWA)   │
└──────────┘  ←───────────  └──────────┘    POST    └──────────┘
               resposta do                     │
                 hook          Tailscale       │
                          └────────────────────┘
```

### Modo Remoto (toggle sob demanda)

O hook `claude-remote-hook` é instalado globalmente e registrado no `~/.claude/settings.json`.
Mas ele **só intercepta tool calls quando o modo remoto está ativo**.

O modo remoto é controlado pela presença do arquivo `~/.claude-watch/remote-mode`:
- **Arquivo não existe (Remote OFF):** hook faz `exit 0` imediato em toda chamada. Zero interferência.
- **Arquivo existe (Remote ON):** hook avalia a tool call e pode bloquear esperando aprovação do celular.

O toggle é ativado pelo botão "Remote ON/OFF" no app, que faz POST ao daemon.
O daemon cria ou remove o arquivo.

#### Remote OFF (padrão)

```
CC chama tool → hook executa → arquivo não existe → exit 0 → CC segue normal
```

Tudo funciona exatamente como se o hook não existisse.

#### Remote ON

```
CC chama tool → hook executa → arquivo existe → avalia tool call:
  - ALWAYS_ALLOWED_TOOLS (Read, Edit, Write, Glob, Grep, etc.) → exit 0
  - Bate com permissions.allow do settings.json → exit 0
  - Bate com permissions.deny → stdout "deny"
  - Sem match → POST ao daemon → bloqueia → espera aprovação do celular
```

#### Daemon fora do ar (fallback)

```
Hook tenta POST ao daemon → falha → retorna "ask" → CC escala pro terminal
```

O CC mostra a pergunta no terminal normalmente. O sistema nunca trava.

### Descoberta de sessões: CC Hooks

O usuário abre terminais e roda `claude` normalmente. Não precisa mudar o fluxo de trabalho.
A descoberta e interceptação acontece via hook global `PreToolUse` no `~/.claude/settings.json`.

O hook lê o próprio `settings.json` do CC para saber o que já é auto-aprovado.
**Não há config separada de permissões** — o hook respeita o `permissions.allow` e
`permissions.deny` que o usuário já configurou no CC.

**Formato do hook no settings.json:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "claude-remote-hook",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

O hook `claude-remote-hook` convive com hooks existentes (ex: validate-accents).

**Dados recebidos pelo hook via stdin:**

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "algum-comando-desconhecido",
    "description": "..."
  },
  "cwd": "/home/adriano/project",
  "permission_mode": "default"
}
```

**Lógica completa do hook:**

```
0. Arquivo ~/.claude-watch/remote-mode existe?
   - NÃO → exit 0 (modo remoto desligado, não interfere)
   - SIM → continua

1. Lê JSON do stdin (session_id, tool_name, tool_input)

2. Tool está na ALWAYS_ALLOWED_TOOLS?
   - SIM → exit 0 (Read, Glob, Grep, Edit, Write, etc.)

3. Lê ~/.claude/settings.json → permissions.allow e permissions.deny

4. Decisão:
   - tool bate com permissions.deny?  → stdout: permissionDecision "deny"
   - tool bate com permissions.allow? → exit 0 silencioso (CC segue normal)
   - tool não bate com nenhum?        → POST ao daemon, bloqueia esperando celular
                                        → celular aprova: stdout permissionDecision "allow"
                                        → celular rejeita: stdout permissionDecision "deny"
                                        → daemon inacessível: stdout "ask" (fallback terminal)
```

**ALWAYS_ALLOWED_TOOLS** (tools que nunca são interceptadas, mesmo com remote ON):
- Read-only: `Read`, `Glob`, `Grep`, `Task`, `TaskOutput`, `WebSearch`, `WebFetch`
- UI/planning: `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`
- Task management: `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList`
- File editing (CC gerencia internamente): `Edit`, `Write`, `NotebookEdit`, `MultiEdit`
- Agent tools: `Skill`, `TeamCreate`, `TeamDelete`, `SendMessage`, `TaskStop`
- MCP resources: `ListMcpResourcesTool`, `ReadMcpResourceTool`

**Formato de resposta do hook (stdout JSON):**

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Approved remotely via claude-watch"
  }
}
```

Decisões possíveis: `"allow"`, `"deny"`, `"ask"` (escala pro terminal local).

**Exemplo com as permissões atuais do usuário (Remote ON):**

| Ação do CC | O que o hook faz |
|---|---|
| `Read`, `Edit`, `Write`, `Glob`, `Grep` | exit 0 (ALWAYS_ALLOWED_TOOLS) |
| `Bash(npm test)` | exit 0 (`Bash(npm:*)` → allow no settings.json) |
| `Bash(git push)` | exit 0 (`Bash(git:*)` → allow) |
| `Bash(rm -rf /*)` | "deny" (deny list) |
| `Bash(algum-comando-novo)` | **vai pro celular** |

**Resultado:** só o que hoje já pede confirmação no terminal vai pro celular.
O hook é invisível para tudo que já é auto-aprovado.

### Backend (Daemon no notebook)

- **Runtime:** Node.js + TypeScript
- **Responsabilidades:**
  - Receber notificações dos hooks do CC via HTTP
  - Manter registro de sessões ativas (identificadas pelo `session_id` do CC)
  - Expor API HTTP: SSE para streaming de eventos, POST para ações
  - Responder aos hooks com a decisão do usuário (approve/reject)
  - Gerenciar o arquivo de remote mode (`~/.claude-watch/remote-mode`)
- **Framework:** Fastify (leve, suporte nativo a SSE)

### Frontend (PWA no celular)

- **Framework:** Angular (familiaridade do desenvolvedor)
- **Funcionalidades do MVP:**
  - Toggle Remote ON/OFF para ativar/desativar interceptação
  - Listar sessões ativas com status (working, waiting_approval, idle, error)
  - Notificações push quando uma sessão pede confirmação
  - Botões de ação: Approve / Reject
  - Preview da ação que o CC quer executar antes de aprovar

### Rede

- **Tailscale** para conectividade segura entre notebook e celular
- Sem necessidade de abrir portas ou configurar DDNS
- HTTPS via certificados do Tailscale

## Decisões Técnicas

### SSE + POST (não WebSocket)

O padrão de comunicação é assimétrico:
- Servidor → Celular: stream constante (status, logs, pedidos) → **SSE**
- Celular → Servidor: ações pontuais e esporádicas (approve, reject) → **POST**

SSE tem reconexão automática, é mais simples, funciona melhor com Service Workers,
e é HTTP puro (debugável no DevTools). WebSocket seria over-engineering para este caso.

### Modo remoto sob demanda (não always-on)

O hook não intercepta nada por padrão. O usuário ativa o modo remoto quando quer
aprovar ações pelo celular. Isso evita:
- Bloquear sessões acidentalmente
- Interferir com tools que o CC gerencia internamente (Edit, Write)
- Overhead desnecessário quando o usuário está no terminal

### Autenticação por dispositivo (não por sessão)

O usuário abre terminais e roda `claude` normalmente. Não faz sentido pedir um UUID por sessão.
A autenticação é por dispositivo, com pareamento único:

1. Daemon inicia no notebook
2. Primeira vez: celular pareia com o daemon (PIN exibido no terminal do daemon)
3. Daemon gera um token de dispositivo (UUID) e envia ao celular
4. Celular armazena o token e usa em toda requisição (`Authorization: Bearer <token>`)
5. Todas as sessões CC daquele notebook ficam visíveis automaticamente

**Camadas de segurança:**

| Camada | O que protege |
|---|---|
| Tailscale | Só dispositivos autorizados acessam a rede |
| Pareamento único | Celular prova que é do dono do notebook (PIN) |
| Token de dispositivo | Identifica o celular em toda requisição |

### Hook lê permissões do CC (sem config duplicada)

O hook `claude-remote-hook` lê `~/.claude/settings.json` em runtime para determinar
se uma tool call deve ser auto-aprovada ou enviada ao celular.

- **Não existe config separada de permissões no claude-watch**
- O usuário mantém suas permissões no CC como sempre fez
- O hook apenas replica a lógica: allow → passa, deny → bloqueia, sem match → celular
- Se o usuário adicionar novas permissões no CC, o hook as respeita automaticamente

## Endpoints da API

```
GET  /sessions                       → Lista todas as sessões ativas
GET  /sessions/events                → SSE stream de eventos (init, session_update, approval_request, heartbeat)
POST /sessions/:id/respond           → Enviar resposta (approve/reject)
POST /sessions/:id/stop              → Parar a sessão

GET  /hooks/remote-mode              → Status do modo remoto (sem auth — chamado pelo hook)
POST /hooks/remote-mode              → Toggle do modo remoto (requer auth)
POST /hooks/pre-tool-use             → Recebe notificação do hook (sem auth — chamado pelo hook)
                                       Bloqueia até o usuário responder ou timeout (295s)

POST /auth/pair                      → Pareamento inicial (PIN → token de dispositivo)
```

## Estrutura do Projeto

```
claude-remote/
├── CLAUDE.md
├── package.json                  # Root: npm workspaces
├── tsconfig.base.json
├── packages/
│   ├── shared/                   # @claude-watch/shared — tipos e lógica de permissões
│   │   └── src/
│   │       ├── types.ts
│   │       └── permissions.ts    # ALWAYS_ALLOWED_TOOLS, checkPermission()
│   ├── hook/                     # @claude-watch/hook — CLI (claude-remote-hook)
│   │   └── src/
│   │       └── index.ts          # Checa remote-mode → stdin → decide ou consulta daemon
│   ├── daemon/                   # @claude-watch/daemon — servidor Fastify
│   │   └── src/
│   │       ├── server.ts
│   │       ├── routes/
│   │       │   ├── hooks.ts      # pre-tool-use + remote-mode toggle
│   │       │   ├── sessions.ts   # GET /sessions + SSE /sessions/events
│   │       │   ├── respond.ts    # POST /sessions/:id/respond
│   │       │   └── auth.ts       # POST /auth/pair
│   │       └── services/
│   │           ├── session-manager.ts
│   │           ├── pending-store.ts
│   │           └── auth-service.ts
│   └── app/                      # @claude-watch/app — Angular PWA
│       └── src/app/
│           ├── services/         # auth, api, sse
│           └── pages/            # sessions, approval, pair
└── scripts/
    └── setup.js                  # Configura hook no settings.json
```

## Convenções

- TypeScript strict mode em todo o projeto
- ESM modules (não CommonJS)
- Nomes de variáveis e código em inglês
- Documentação e commits em português
- Sem over-engineering: MVP primeiro, incrementos depois

## MVP (Escopo mínimo) ✅

1. ✅ Hook `claude-remote-hook` com modo remoto sob demanda
2. ✅ Daemon que recebe hooks, registra sessões e expõe SSE
3. ✅ PWA que lista sessões com status + toggle Remote ON/OFF
4. ✅ Botões approve/reject funcionando no app
5. ✅ Auth por pareamento de dispositivo (PIN + token)
6. ✅ Script `setup.js` que configura o hook no settings.json

## Fora do MVP (futuro)

- Terminal remoto interativo completo
- Input de texto livre pelo celular
- Rate limiting
- Múltiplos usuários
- Histórico de sessões
- Timeout automático com política configurável (auto-approve, auto-reject)
- QR code para pareamento

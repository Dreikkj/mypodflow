# myPodFlow — Guia de Lançamento Atualizado
**Criado por Eslem Marques © 2026 — mypodflow.com.br**

> Versão atualizada conforme o estado real do projeto: **OpenAI mantida**, **Anthropic removido**, **AbacatePay removido**, **PIX manual + Discord**, **shorts MP4 com FFmpeg**, **yt-dlp para URLs**.

---

## 1. Visão geral do projeto

O **myPodFlow** é um SaaS para creators, podcasters e marcas que transforma um conteúdo longo em vários formatos prontos para publicar.

O usuário pode enviar:

- áudio
- vídeo
- podcast
- episódio
- link do YouTube

E o sistema gera:

- 📄 Transcrição completa
- 📝 Blog post
- 🧵 Thread para X/Twitter
- 📧 Newsletter
- 📌 Resumo executivo
- 🏷️ Títulos e hooks
- 🎬 Shorts/Reels/TikTok em MP4

---

## 2. Integrações atuais

### Mantidas

- **OpenAI**
  - transcrição
  - análise de conteúdo
  - geração de blog/thread/newsletter/hooks
  - identificação de melhores cortes

- **FFmpeg / FFprobe**
  - validação de mídia
  - cortes de vídeo
  - geração de shorts MP4
  - vídeo vertical 9:16
  - legendas opcionais

- **yt-dlp**
  - download de vídeos por URL

- **Resend**
  - emails transacionais
  - verificação de email
  - recuperação de senha

- **Google OAuth**
  - login com Google

- **Discord**
  - suporte oficial
  - tickets
  - envio de comprovantes PIX

### Removidas / desativadas

- Anthropic
- Chat IA de suporte
- AbacatePay
- Webhook de pagamento automático
- Checkout automático
- Aprovação automática de plano

---

## 3. Variáveis de ambiente — Railway

Acesse:

```text
https://railway.com/dashboard
```

Entre no serviço do backend:

```text
Variables → Add Variable
```

Adicione:

```env
PORT=3001
NODE_ENV=production

SITE_URL=https://mypodflow.com.br
FRONTEND_URL=https://mypodflow.com.br

JWT_SECRET=COLE_CHAVE_GERADA_AQUI
SESSION_SECRET=COLE_OUTRA_CHAVE_AQUI

DB_PATH=./database.sqlite

OPENAI_API_KEY=sk-XXXXX

GOOGLE_CLIENT_ID=XXXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-XXXXX
GOOGLE_CALLBACK_URL=https://mypodflow.com.br/api/auth/google/callback

RESEND_API_KEY=re_XXXXX
FROM_EMAIL=noreply@mypodflow.com.br
FROM_NAME=myPodFlow

DISCORD_SUPPORT_URL=https://discord.gg/kzE62vDz4j

OPENAI_TIMEOUT_MS=120000
YTDLP_TIMEOUT_MS=120000
ENABLE_STORAGE_CLEANUP=true
```

Para gerar `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Rode duas vezes: uma para `JWT_SECRET` e outra para `SESSION_SECRET`.

---

## 4. Dependências do servidor

No servidor/backend, é importante ter:

```bash
node --version
npm --version
ffmpeg -version
ffprobe -version
yt-dlp --version
```

Se faltar FFmpeg:

```bash
sudo apt update
sudo apt install ffmpeg -y
```

Se faltar yt-dlp:

```bash
sudo apt install python3-pip -y
pipx install yt-dlp
```

ou:

```bash
sudo apt install yt-dlp -y
```

---

## 5. Google OAuth

Acesse:

```text
https://console.cloud.google.com
```

Configure:

```text
APIs & Services → OAuth consent screen
```

Dados:

- App name: `myPodFlow`
- User support email: seu email
- Authorized domain: `mypodflow.com.br`

Depois:

```text
Credentials → Create Credentials → OAuth 2.0 Client ID
```

Tipo:

```text
Web application
```

Redirect URIs:

```text
https://mypodflow.com.br/api/auth/google/callback
http://localhost:3001/api/auth/google/callback
```

No `.env` local:

```env
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
```

Em produção:

```env
GOOGLE_CALLBACK_URL=https://mypodflow.com.br/api/auth/google/callback
```

---

## 6. OpenAI

Acesse:

```text
https://platform.openai.com/api-keys
```

Crie uma chave e coloque:

```env
OPENAI_API_KEY=sk-XXXXX
```

A OpenAI é usada para:

- transcrição
- análise do episódio
- blog
- thread
- newsletter
- resumo
- hooks
- cortes sugeridos
- conteúdo final

Se a OpenAI falhar, o sistema deve mostrar erro real, sem mock.

---

## 7. Resend — emails

Acesse:

```text
https://resend.com
```

Configure o domínio:

```text
Domains → Add Domain → mypodflow.com.br
```

Adicione os registros DNS que o Resend fornecer.

Depois crie API Key:

```text
API Keys → Create API Key
```

Variáveis:

```env
RESEND_API_KEY=re_XXXXX
FROM_EMAIL=noreply@mypodflow.com.br
FROM_NAME=myPodFlow
```

---

## 8. PIX manual

O myPodFlow usa **PIX manual**.

Não há gateway automático.

Fluxo:

1. usuário escolhe plano
2. site mostra QR Code PIX
3. usuário paga
4. clica em “Já paguei”
5. abre Discord
6. envia comprovante no ticket
7. admin aprova plano manualmente

Discord oficial:

```text
https://discord.gg/kzE62vDz4j
```

---

## 9. PIX copia e cola

### Starter — R$39

```text
00020126580014br.gov.bcb.pix0136722d35bc-cb26-4666-a157-c4bc1341edf0520400005303986540539.005802BR5924ESLEM MARQUES DOS PASSOS6011PORTOVELHO62580520SAN2026050617075028150300017br.gov.bcb.brcode01051.0.063049E7D
```

### Creator — R$99

```text
00020126580014br.gov.bcb.pix0136722d35bc-cb26-4666-a157-c4bc1341edf0520400005303986540599.005802BR5924ESLEM MARQUES DOS PASSOS6011PORTOVELHO62580520SAN2026050617091561450300017br.gov.bcb.brcode01051.0.06304F542
```

### Scale — R$399

```text
00020126580014br.gov.bcb.pix0136722d35bc-cb26-4666-a157-c4bc1341edf05204000053039865406399.005802BR5924ESLEM MARQUES DOS PASSOS6011PORTOVELHO62580520SAN2026050617103229150300017br.gov.bcb.brcode01051.0.063041918
```

---

## 10. Painel admin PIX

O painel admin deve permitir:

- buscar usuário por email
- ver plano atual
- selecionar novo plano
- aprovar pagamento PIX manual
- registrar admin responsável
- registrar data da aprovação
- registrar plano anterior e novo plano

Campos importantes:

```text
plan
plan_status
plan_updated_at
pix_approved_at
pix_approved_by
plan_previous_id
plan_started_at
plan_expires_at
```

Planos pagos duram 30 dias.

Ao vencer:

- usuário volta para `free`
- `plan_status` vira `expired`
- precisa renovar manualmente

---

## 11. DNS e domínio

No Railway:

```text
Settings → Networking → Custom Domain
```

Configure:

```text
mypodflow.com.br
www.mypodflow.com.br
```

No provedor DNS, aponte conforme o Railway indicar.

---

## 12. Deploy no Railway

Backend:

```bash
cd ~/projetos/podcastai_v2/backend
railway link
railway up
```

Frontend:

```bash
cd ~/projetos/podcastai_v2/frontend
railway link
railway up
```

---

## 13. Criar conta admin

Após criar sua conta normalmente no site, rode no backend:

```bash
railway run node -e "
const db = require('./config/database');
db.initDB().then(() => {
  db.run('UPDATE users SET is_admin=1 WHERE email=?', ['seu@email.com'])
    .then(() => { console.log('Admin criado!'); process.exit(0); });
});
"
```

Troque:

```text
seu@email.com
```

pelo seu email real.

---

## 14. Checklist final

### Configuração

- [ ] `JWT_SECRET` configurado
- [ ] `SESSION_SECRET` configurado
- [ ] `OPENAI_API_KEY` configurado
- [ ] `GOOGLE_CLIENT_ID` configurado
- [ ] `GOOGLE_CLIENT_SECRET` configurado
- [ ] `GOOGLE_CALLBACK_URL` configurado
- [ ] `RESEND_API_KEY` configurado
- [ ] `FROM_EMAIL` configurado
- [ ] Discord configurado
- [ ] PIX manual inserido no frontend
- [ ] QR Codes dos planos adicionados
- [ ] domínio configurado
- [ ] SSL funcionando

### Sistema

- [ ] cadastro funcionando
- [ ] login email/senha funcionando
- [ ] login Google funcionando
- [ ] dashboard funcionando
- [ ] upload por arquivo funcionando
- [ ] upload por URL funcionando
- [ ] OpenAI processando
- [ ] transcrição funcionando
- [ ] blog/thread/newsletter funcionando
- [ ] shorts MP4 funcionando
- [ ] legendas opcionais funcionando
- [ ] histórico funcionando
- [ ] painel admin funcionando
- [ ] aprovação PIX manual funcionando
- [ ] expiração de plano funcionando

### Produção

- [ ] testar no celular
- [ ] testar Chrome
- [ ] testar Firefox
- [ ] testar Safari/Edge se possível
- [ ] verificar erros no console
- [ ] verificar logs backend
- [ ] verificar espaço em disco
- [ ] verificar cleanup automático
- [ ] testar 2 uploads seguidos

---

## 15. Suporte oficial

O único suporte oficial do myPodFlow é via Discord:

```text
https://discord.gg/kzE62vDz4j
```

Após pagamento PIX, o usuário deve abrir ticket e enviar comprovante.

---

## 16. Créditos

Produto: **myPodFlow**  
Criador: **Eslem Marques**  
Site: **https://mypodflow.com.br**  
Discord: **https://discord.gg/kzE62vDz4j**

© 2026 — myPodFlow. Criado por Eslem Marques.
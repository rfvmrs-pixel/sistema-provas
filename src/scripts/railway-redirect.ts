// O Triunfo Skill mudou para o VPS (https://provas.triunfobridge.tech, 26/10/2026). O mesmo código continua
// publicado na Railway pela main, então lá ele só redireciona: este script roda primeiro no `npm start` e, na
// Railway (RAILWAY_ENVIRONMENT_NAME existe em tempo de execução), sobe um servidor que manda tudo para o
// endereço novo e nunca termina — as migrações e o Next não rodam contra o banco antigo. Fora da Railway sai na hora.
import http from "node:http";

const DESTINO = "https://provas.triunfobridge.tech";

if (!process.env.RAILWAY_ENVIRONMENT_NAME) process.exit(0);

const porta = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok (redireciona para " + DESTINO + ")");
      return;
    }
    res.writeHead(308, { Location: DESTINO + (req.url || "/"), "Cache-Control": "no-store" });
    res.end();
  })
  .listen(porta, () => console.log(`[railway-redirect] Triunfo Skill mudou: tudo vai para ${DESTINO} (porta ${porta})`));

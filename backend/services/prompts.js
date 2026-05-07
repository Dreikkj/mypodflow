/**
 * podcast.ai — AI Prompts
 * Criado por Eslem Marques
 * © 2026 podcast.ai
 */

const TONES = {
  professional: 'profissional, claro e direto ao ponto',
  casual: 'descontraído, próximo e com personalidade',
  educational: 'educativo, didático e acessível',
  technical: 'técnico, preciso e detalhado',
  persuasive: 'persuasivo, envolvente e orientado à ação',
};

function getTone(tone) {
  return TONES[tone] || TONES.professional;
}

const PROMPTS = {

  cleanTranscript: (raw) => `
Você recebeu uma transcrição bruta em português brasileiro.

Sua tarefa:
- corrigir erros claros de transcrição
- remover repetições excessivas
- melhorar pontuação
- organizar em parágrafos
- manter o sentido original
- preservar o estilo natural da fala

Regras absolutas:
- não invente informações
- não resuma
- não altere opiniões
- não adicione conteúdo externo

Retorne APENAS a transcrição limpa, sem comentários.

TRANSCRIÇÃO BRUTA:
${raw}
`,

  extractInsights: (cleaned) => `
Analise a transcrição abaixo e extraia os elementos estratégicos do conteúdo.

Retorne em JSON válido com esta estrutura:
{
  "summary": "resumo geral em 2-3 frases",
  "main_themes": ["tema 1", "tema 2"],
  "key_ideas": ["ideia 1", "ideia 2"],
  "strong_quotes": ["citação 1", "citação 2"],
  "viral_moments": ["momento 1", "momento 2"],
  "controversial_points": ["ponto 1"],
  "possible_titles": ["título 1", "título 2", "título 3"],
  "social_hooks": ["hook 1", "hook 2"]
}

Use português brasileiro. Não invente nada fora da transcrição.

TRANSCRIÇÃO:
${cleaned}
`,

  generateBlog: (cleaned, insights, tone) => `
Crie um artigo de blog completo com base na transcrição e nos insights fornecidos.

Tom desejado: ${getTone(tone)}

Requisitos:
- título forte e otimizado para SEO
- introdução envolvente que prenda o leitor
- subtítulos H2 e H3 bem distribuídos
- texto bem estruturado em parágrafos
- linguagem clara e natural
- otimização para SEO (palavras-chave naturais)
- conclusão com call-to-action
- português brasileiro natural e fluido

Regras:
- não invente informações além da transcrição
- não use linguagem robótica ou artificial
- não pareça um resumo genérico
- transforme o conteúdo em artigo publicável e valioso

Retorne em Markdown.

INSIGHTS EXTRAÍDOS:
${JSON.stringify(insights, null, 2)}

TRANSCRIÇÃO LIMPA:
${cleaned.slice(0, 6000)}
`,

  generateThread: (cleaned, insights, tone) => `
Crie uma thread completa para X (Twitter) com base no conteúdo.

Tom desejado: ${getTone(tone)}

Requisitos:
- primeiro tweet com hook irresistível (máx 280 chars)
- um tweet por ideia principal
- linguagem direta e impactante
- máximo potencial de engajamento e compartilhamento
- coerência e progressão entre os tweets
- último tweet com CTA claro

Formato obrigatório:
1/ [primeiro tweet]

2/ [segundo tweet]

...

N/ [tweet final com CTA]

Regras:
- não invente fatos
- máximo 2-3 hashtags no total, apenas no final
- cada tweet independente mas parte do todo

INSIGHTS:
${JSON.stringify(insights, null, 2)}

TRANSCRIÇÃO:
${cleaned.slice(0, 4000)}
`,

  generateNewsletter: (cleaned, insights, tone) => `
Crie uma newsletter completa e pronta para envio.

Tom desejado: ${getTone(tone)}

Estrutura obrigatória:
1. Linha de assunto do email (forte e com alta taxa de abertura)
2. Preview text (aparece no cliente de email antes de abrir)
3. Abertura calorosa e pessoal
4. Resumo do conteúdo em 1-2 parágrafos
5. Principais aprendizados em bullet points (máx 5)
6. Frase marcante do episódio em destaque
7. Call-to-action final claro

A newsletter deve parecer escrita por uma pessoa real, não por IA.
Use português brasileiro natural.
Tom: ${getTone(tone)}

INSIGHTS:
${JSON.stringify(insights, null, 2)}

TRANSCRIÇÃO:
${cleaned.slice(0, 4000)}
`,

  generateShorts: (cleaned, limit, withTimestamps = false) => `
Analise o conteúdo e selecione os ${limit} melhores momentos para vídeos curtos (Shorts/Reels).

Critérios de seleção:
- falas impactantes e memoráveis
- momentos emocionais genuínos
- ideias fortes e originais
- trechos polêmicos ou provocadores
- explicações curtas e valiosas
- começo que prende atenção nos primeiros 3 segundos

Para cada short, retorne em JSON:
[
  {
    "title": "título chamativo para o vídeo",
    "start_time": "${withTimestamps ? 'timestamp real ex: 00:04:32' : 'aproximado ex: início'}",
    "end_time": "${withTimestamps ? 'timestamp real' : 'aproximado'}",
    "description": "por que esse momento foi escolhido",
    "caption": "legenda para publicação",
    "screen_text": "texto que aparece na tela do vídeo"
  }
]

Regras:
- máximo ${limit} sugestões
- trechos de 15 a 60 segundos idealmente
- não escolher trecho sem contexto suficiente
- não inventar falas
- português brasileiro

CONTEÚDO:
${cleaned.slice(0, 5000)}
`,

  generateInstagram: (cleaned, insights, tone) => `
Crie uma legenda completa para Instagram.

Tom desejado: ${getTone(tone)}

Requisitos:
- primeira frase fortíssima (é o que aparece antes do "ver mais")
- texto natural e envolvente
- emojis usados com moderação e propósito
- call-to-action claro
- 20 a 30 hashtags relevantes ao nicho
- português brasileiro autêntico

Regras:
- não exagere nos emojis
- não pareça spam
- não use linguagem artificial
- a primeira linha deve parar o scroll

INSIGHTS:
${JSON.stringify(insights, null, 2)}

TRANSCRIÇÃO:
${cleaned.slice(0, 3000)}
`,

  formatTranscript: (cleaned) => `
Formate a transcrição para leitura confortável como documento.

Requisitos:
- separar em blocos temáticos com títulos
- melhorar pontuação onde necessário
- organizar falas por locutor quando identificável
- preservar todo o conteúdo original
- adicionar separadores visuais entre seções

Regras absolutas:
- não resuma nenhuma parte
- não reescreva com outro sentido
- não remova conteúdo

Retorne a transcrição formatada completa.

TRANSCRIÇÃO:
${cleaned}
`,

};

module.exports = { PROMPTS, getTone };

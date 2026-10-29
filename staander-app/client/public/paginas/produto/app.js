const questions = [
  {
    title: "O que você está procurando?",
    subtitle: "Começamos pelo seu objetivo principal.",
    options: [
      ["economizar", "Economizar tempo ou dinheiro", "Quero encontrar uma opção mais eficiente."],
      ["qualidade", "Encontrar a melhor opção", "Prefiro qualidade e compatibilidade."],
      ["descobrir", "Ainda estou descobrindo", "Quero entender o que faz sentido para mim."]
    ]
  },
  {
    title: "O que pesa mais na sua decisão?",
    subtitle: "Não existe resposta certa.",
    options: [
      ["preco", "Preço", "Quero manter o investimento sob controle."],
      ["praticidade", "Praticidade", "Quero algo simples e rápido."],
      ["resultado", "Resultado", "Quero maximizar o que vou receber."]
    ]
  },
  {
    title: "Quanto você já sabe sobre o que procura?",
    subtitle: "Isso ajuda o Staander a ajustar a recomendação.",
    options: [
      ["iniciante", "Pouco", "Ainda estou pesquisando."],
      ["medio", "Mais ou menos", "Já conheço algumas alternativas."],
      ["avancado", "Bastante", "Já sei exatamente o que comparar."]
    ]
  },
  {
    title: "Como você prefere decidir?",
    subtitle: "Escolha o caminho que mais combina com você.",
    options: [
      ["guiado", "Quero uma recomendação", "Mostre-me o melhor caminho."],
      ["comparar", "Quero comparar opções", "Quero ver diferenças antes de escolher."],
      ["explorar", "Quero explorar", "Prefiro navegar pelas possibilidades."]
    ]
  }
];

let current = 0;
const answers = {};

function renderQuestion(){
  const q = questions[current];
  document.getElementById("questionCount").textContent = `${current+1} de ${questions.length}`;
  document.getElementById("progressBar").style.width = `${((current+1)/questions.length)*100}%`;

  document.getElementById("quizContent").innerHTML = `
    <div class="question">
      <h2>${q.title}</h2>
      <p>${q.subtitle}</p>
      <div class="options">
        ${q.options.map(([value,title,desc]) => `
          <button class="option ${answers[current]===value ? "selected":""}" onclick="selectOption('${value}', this)">
            <b>${title}</b><small>${desc}</small>
          </button>`).join("")}
      </div>
    </div>`;

  document.getElementById("backBtn").disabled = current === 0;
  document.getElementById("nextBtn").textContent = current === questions.length-1 ? "Ver meu resultado →" : "Continuar →";
  document.getElementById("nextBtn").disabled = answers[current] === undefined;
}

function selectOption(value, el){
  answers[current] = value;
  document.querySelectorAll(".option").forEach(x=>x.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("nextBtn").disabled = false;
}

function nextQuestion(){
  if(answers[current] === undefined) return;
  if(current < questions.length-1){ current++; renderQuestion(); }
  else showResult();
}

function previousQuestion(){
  if(current > 0){ current--; renderQuestion(); }
}

function showResult(){
  document.getElementById("quiz").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");

  const guided = answers[3] === "guiado";
  const price = answers[1] === "preco" || answers[0] === "economizar";
  const title = guided ? "Você se beneficia de uma decisão guiada." : "Você está pronto para explorar suas opções.";
  const text = price
    ? "O Staander deve priorizar alternativas que entreguem boa relação entre custo, praticidade e resultado."
    : "O Staander deve reduzir o excesso de opções e destacar aquilo que tem maior aderência ao seu objetivo.";

  document.getElementById("resultTitle").textContent = title;
  document.getElementById("resultText").textContent = text;
  document.getElementById("resultItems").innerHTML = `
    <div class="result-item"><b>01 — Perfil identificado</b><span>${answers[0] || "descoberta"} + ${answers[1] || "praticidade"}</span></div>
    <div class="result-item"><b>02 — Próximo passo</b><span>Apresentar recomendações personalizadas com base nas suas respostas.</span></div>
    <div class="result-item"><b>03 — Conversão</b><span>Levar você diretamente à opção mais relevante, sem uma busca interminável.</span></div>`;
  window.scrollTo({top: document.getElementById("result").offsetTop, behavior:"smooth"});
}

function resetQuiz(){
  current=0;
  for(const k in answers) delete answers[k];
  document.getElementById("result").classList.add("hidden");
  document.getElementById("quiz").classList.remove("hidden");
  renderQuestion();
  scrollToQuiz();
}
function scrollToQuiz(){document.getElementById("quiz").scrollIntoView({behavior:"smooth"});}
renderQuestion();

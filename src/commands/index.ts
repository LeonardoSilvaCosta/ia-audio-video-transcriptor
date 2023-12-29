export const improveTranscription = (firstPaper: string, secondPaper: string) => {
  const command = `'Você receberá a transcrição de um conteúdo de vídeo. 
  Você deve melhorar a organização dessa transcrição para que ela apresente:
   1. maior clareza e precisão; 
   2. Contexto e coerência; 
   3. Identificação e correção de erros;
   4. Organize-a de forma a separar os papéis de ${firstPaper} e ${secondPaper}'.
  
   Atenção: você deve manter todos os trechos de fala, o objetivo é somente melhorar o texto.
   `;

   return command;
}
export const improveTranscription = (firstPaper: string, secondPaper: string) => {
  const command = `Reescreva o texto fornecido utilizando as seguintes instruções:
  
  1. Adicione maior clareza e precisão;

  2. Adicione contexto e coerência: se necessário, insira informações adicionais que ajudem a entender o que está sendo discutido;
  
  3. Identifique e corrija erros: certifique-se de corrigir erros de ortografia, gramática e pontuação;

 4. Separe a fala de cada pessoa em ${firstPaper} e ${secondPaper}.
  
5. O seu output deve ser o texto fornecido completo com as melhorias informadas acima.
   `;

  return command;
}
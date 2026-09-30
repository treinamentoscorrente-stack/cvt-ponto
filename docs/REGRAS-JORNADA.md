# Regras de jornada — CVT Ponto

## Jornada padrão
- Segunda a sexta: 8h previstas (480 minutos), salvo feriado ou ocorrência.
- Sábado e domingo: 0h previstas.
- Feriado: 0h previstas.
- Dia comum completo: Entrada → Início intervalo → Fim intervalo → Saída.

## Falta
- Sempre corresponde ao dia inteiro.
- Gera 8h negativas em um dia útil normal.
- Não pode coexistir com batidas no mesmo dia.
- Não pode ser lançada em fim de semana ou feriado, pois nesses dias não há jornada prevista.

## Folga
### Dia todo
- Jornada prevista: 0h.
- Sem batidas: saldo 0.
- Se houver trabalho e a folga for mantida, as horas trabalhadas ficam positivas.

### Folga de manhã
- O funcionário está dispensado pela manhã e trabalha somente a outra metade da jornada.
- Jornada prevista: 4h em um dia útil normal.
- Fluxo do ponto do funcionário: Entrada → Saída.
- Saldo = horas trabalhadas - 4h.

### Folga à tarde
- O funcionário trabalha somente a primeira metade da jornada e está dispensado à tarde.
- Jornada prevista: 4h em um dia útil normal.
- Fluxo do ponto do funcionário: Entrada → Saída.
- Saldo = horas trabalhadas - 4h.

## Atestado
- Nesta primeira versão, o atestado cobre o dia inteiro.
- Jornada prevista: 0h.
- Não gera horas negativas.
- Não pode coexistir com batidas no mesmo dia.

## Ajuste manual do ponto
- O administrador pode inserir, corrigir ou remover Entrada, Início intervalo, Fim intervalo e Saída.
- O funcionário também pode solicitar um ajuste, mas a solicitação fica PENDENTE e não altera o ponto até aprovação administrativa.
- O motivo do ajuste é obrigatório.
- A auditoria registra funcionário, data, motivo, valores anteriores e valores novos.
- Horários informados devem respeitar ordem crescente.

## Jornada extra
- É separada da jornada normal.
- Usa somente Entrada Extra → Saída Extra, sem intervalo.
- Os horários são registrados pelo servidor; o funcionário não escolhe manualmente a hora.
- Pode atravessar a meia-noite. Exemplo: 22:15 → 03:00 = 4h45.
- Uma única jornada extra pode ficar aberta por funcionário.
- Enquanto a jornada extra estiver aberta, o ponto normal fica bloqueado para evitar sobreposição.
- A duração completa da jornada extra entra como horas trabalhadas e como horas positivas.
- A jornada normal do dia continua com sua previsão própria; a jornada extra não altera as 8h previstas.
- Para fechamento mensal, a jornada extra pertence ao mês/data em que a Entrada Extra foi registrada.
- A referência do treinamento/empresa pode ser informada opcionalmente, por exemplo: Treinamento Karsten.
- Esta regra registra minutos extras no banco de horas; não calcula adicional remuneratório, adicional noturno ou percentuais de folha.

## Dias sem registro
- Um dia útil sem ponto e sem ocorrência continua como SEM REGISTRO.
- O sistema não debita automaticamente 8h nesses casos.
- Para efetuar o débito integral, o administrador deve lançar FALTA.

## Relatórios
- Jornadas extras aparecem separadamente e também são somadas aos totais de horas trabalhadas, horas positivas e saldo.
- Falta entra nas horas negativas.
- Atestado e folga integral não geram débito.
- Folga parcial usa 4h previstas.
- Feriado usa 0h previstas.
- Trabalho em feriado ou folga integral pode gerar saldo positivo.

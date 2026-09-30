# Regras de jornada — CVT Ponto

## Jornada padrão
- Segunda a sexta: 8h previstas (480 minutos), salvo feriado ou ocorrência.
- Sábado e domingo: 0h previstas.
- Feriado: 0h previstas.
- Dia comum completo: Entrada → Início intervalo → Fim intervalo → Saída.
- Quando não houver intervalo, o sistema aceita Entrada → Saída e contabiliza todo o período entre os dois horários como trabalhado.

## Falta
- Sempre corresponde ao dia inteiro.
- Gera 8h negativas em um dia útil normal.
- Não pode coexistir com batidas no mesmo dia.
- Não pode ser lançada em fim de semana ou feriado, pois nesses dias não há jornada prevista.

## Folga
A folga consome saldo do banco de horas no momento em que é cadastrada. Se não houver saldo positivo suficiente, o banco passa a ficar negativo.

### Dia todo
- Débito no banco de horas: 8h em um dia útil normal.
- O ponto normal fica bloqueado.
- Não há jornada normal prevista para ser registrada naquele dia.
- Exemplo: saldo anterior +6h e folga integral de 8h → novo saldo -2h.

### Folga de manhã
- Débito no banco de horas: 4h em um dia útil normal.
- O funcionário trabalha somente à tarde.
- Jornada de trabalho esperada no período trabalhado: 4h.
- Fluxo do ponto: Entrada → Saída.
- Se trabalhar exatamente 4h, o saldo do dia permanece com o débito de -4h da folga.
- Horas trabalhadas acima ou abaixo das 4h compensam ou aumentam a diferença normalmente.

### Folga à tarde
- Débito no banco de horas: 4h em um dia útil normal.
- O funcionário trabalha somente de manhã.
- Jornada de trabalho esperada no período trabalhado: 4h.
- Fluxo do ponto: Entrada → Saída.
- Se trabalhar exatamente 4h, o saldo do dia permanece com o débito de -4h da folga.
- Horas trabalhadas acima ou abaixo das 4h compensam ou aumentam a diferença normalmente.

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

## Jornada sem intervalo
- Pode ser registrada somente com Entrada → Saída.
- Todo o período entre os dois horários é considerado trabalhado.
- Exemplo: 06:20 → 20:00 = 13h40 trabalhadas.
- Em uma jornada prevista de 8h, esse exemplo gera +5h40 de saldo positivo.
- Se existir apenas Entrada, ou uma sequência parcial de intervalo, a jornada continua incompleta até haver registros suficientes.

## Jornada extra
- O registro é manual e sempre depende de aprovação administrativa.
- O funcionário informa data/hora de entrada, data/hora de saída e a referência/motivo do trabalho extra.
- A solicitação fica PENDENTE e não altera o banco de horas enquanto aguarda análise.
- O administrador pode APROVAR ou REJEITAR.
- Somente solicitações APROVADAS entram como horas trabalhadas, horas positivas e saldo.
- Usa somente Entrada Extra → Saída Extra, sem intervalo.
- Pode atravessar a meia-noite. Exemplo: 22:15 em um dia → 03:00 no dia seguinte = 4h45.
- A jornada extra não altera as 8h previstas da jornada normal.
- O período informado não pode estar no futuro nem ultrapassar 24h.
- Para fechamento mensal, a jornada extra pertence ao mês/data da Entrada Extra.
- Solicitações sobrepostas pendentes/aprovadas são bloqueadas para evitar duplicidade.
- Esta regra registra minutos positivos no banco de horas; não calcula adicional remuneratório, adicional noturno ou percentuais de folha.
- Registros legados concluídos continuam preservados. Registros legados incompletos não entram nos totais.

## Dias sem registro
- Um dia útil sem ponto e sem ocorrência continua como SEM REGISTRO.
- O sistema não debita automaticamente 8h nesses casos.
- Para efetuar o débito integral, o administrador deve lançar FALTA.

## Relatórios
- Jornadas extras aparecem separadamente e também são somadas aos totais de horas trabalhadas, horas positivas e saldo.
- Falta entra nas horas negativas.
- Atestado não gera débito.
- Folga integral debita 8h do banco em dia útil normal.
- Folga parcial debita 4h do banco e mantém 4h de jornada no período trabalhado.
- Feriado usa 0h previstas.
- Trabalho em feriado ou folga integral pode gerar saldo positivo.

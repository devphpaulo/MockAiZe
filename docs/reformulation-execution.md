# Execução da reformulação Site/Desktop

Início: 27/10/2026. Autorização: pedido explícito do usuário para executar `02_PLANO_SITE.md` tarefa a tarefa, com premissa de Desktop 100% local, equipe pequena e complexidade proporcional. Sem publicação de release ou alteração de serviço/dados reais.

## Base e preflight

Root `D:/development/projects/mockaize/mockaize/code`. Após esclarecimento humano, `staging2` foi criada de `staging`, commit `a3156fc1931f38b8860c12edaad83b2ba8ab62b7`. A tentativa inicial de base main foi corrigida antes de qualquer código. `git fetch origin staging` confirmou staging local e GitHub iguais, zero commits à frente/atrás. Worktree inicial limpa. Nenhuma mudança da staging foi descartada.

Documentos fornecidos: README do pacote, contrato compartilhado, planos API/Site, pareceres/revisão, diário API e `Continuar após implementação do site.md`. A autorização atual prevalece sobre o estado histórico de planejamento desses documentos.

Jesse mapeou normalizador, 20 fórmulas, mutações e testes. Harrisson retornou PRONTO para C-PRESET-1: stdlib, gramática/hash já fechados, contexto explícito no codec. Fatos para tarefas posteriores: backend ainda não calcula libraryPath; settings consome fuso opcionalmente no browser com fallback America/Fortaleza mas não o persiste; journal/pending físico deverá ser fixado por SITE-02 e documentado para API-05.

## Baseline comprovada antes de editar

- `node --check mockaize/web/app.js` e `engine.js`: aprovados.
- `py -m unittest discover -s tests -v`, Python 3.14 fora do sandbox: 23 métodos, 20 falhas de subcasos, zero erros. Todas as falhas reportam PowerShell 5.1 ConvertFrom-Json recusando chaves `fileName`/`filename` que diferem por caixa. É defeito anterior de exportação PS1, confirmado antes da implementação e fora do escopo desta reformulação conforme esclarecimento humano.
- Primeira execução restrita teve também socket local WinError10013 e limpeza de SQLite temporário bloqueado; essas ocorrências desapareceram fora do sandbox. Não constituem regressões desta entrega.

## Controle de tarefas

| Task | Dependências | Owner | Estado | Arquivos/evidência | Risco/bloqueio |
|---|---|---|---|---|---|
| SITE-01 | Contrato aprovado | Oliver | Concluída | 6 testes focados PASS; Dan sem bloqueantes; Luda APROVADO | Consumidor API pendente |
| SITE-02 | SITE-01 | Ye | Concluída | 17 testes preset PASS; 8 regressões persistência PASS; Dan sem bloqueantes; Luda APROVADO, delta final aceito | Integração de negócio na SITE-03 |
| SITE-03 | SITE-01/02 | Ye | Concluída | 23 testes preset PASS; 9 regressões persistência PASS; Dan sem bloqueantes; Luda APROVADO COM RISCO (frozen pendente) | Consumidor API real ainda pendente |
| SITE-04 | SITE-01..03 | coordenação local | Concluída | backfill/import/backup/restore; testes de falha | Restore conserva rollback até recovery |
| SITE-05 | SITE-01..04 | coordenação local | Concluída | HTTP 503 + recovery explícito; estado do Studio | Paridade visual manual pendente |
| SITE-06/FV | Site anterior + API-08 | — | Integração sintética Site→API aprovada; gate visual parcial | API-05 retomada em `mockaize-api/staging2`; produtor e consumidor reais exercitados com dados descartáveis | Runner `DOMParser` no browser ainda não executado |

## SITE-01 — decisões e resultado

Codec puro recebe metadata/config/context explicitamente e produz bytes UTF-8. Usa o normalizador existente numa cópia para validar configuração completa, sem modificar persistência, UI ou motor. A gramática é estrita; fórmulas são identificadas por posição, conservando objetos arbitrários em notas. Namespace, versões, tipos, duplicatas e hash têm erro dedicado PresetError. Caracteres inválidos XML são rejeitados; CR é escapado numericamente. Números são JSON finitos; o hash usa serialização canônica Python acordada, sem biblioteca nova.

Escolha proporcional: especificação Markdown e corpus revisável em lugar de introduzir dependência XSD. O codec não aplica limite HTTP ao agregado de modelos; mantém os limites próprios do normalizador. Semântica de fuso/nome físico e operação de current/OLD ficam para as tarefas responsáveis.

Corpus minimal e complete inclui JSON lógico, XML e hash de referência. O teste recalcula SHA-256 independentemente; complete contém todas as fórmulas, dois modelos e namespaces. Isso valida transporte e integridade, não afirma execução conjunta com consumidor da API. Fixtures ainda precisam ser copiadas/conferidas no repo API quando API-05 for retomada.

Validação focada: `py -m unittest discover -s tests -p test_presets.py -v`: seis métodos aprovados, incluindo subcasos dos quatro modos, wire inválido e codificações/DTD. Reexecutar após review e registrar resultado final. A baseline PowerShell permanece fora desta tarefa. Nenhum dado real, credencial ou serviço instalado acessado.

Gate final SITE-01: Dan retornou SEM ACHADOS BLOQUEANTES e Luda APROVADO. Coordenação reexecutou seis testes, aprovados em 0,794 s. A tarefa foi liberada antes da edição de SITE-02.

## SITE-02 — produtor recuperável e contrato físico

Implementado em modo guiado por plano, com stdlib e serialização pelo RLock já existente. O módulo `preset_store.py` adiciona `PresetUpdate`, `run_operation`, `recover`, `pending` e `PresetSyncError`. `storage.py` recebeu apenas leitura do caminho local, criação de tabela aditiva e recovery no startup; os fluxos de negócio ainda são a SITE-03. O schema exigido pela API legada permanece versão 2.

Contrato físico fechado e documentado em `preset-contract-v1.md`: journal `.sync/<operation UUID>.pending.json`, IDs afetados explícitos, flag catalogWide e snapshots before/after no mesmo diretório dos arquivos finais. `preset_sync_commits` liga o commit SQLite ao hash dos bytes do journal. A callback calcula mudanças dentro da transação não commitada; journal fica durável antes do commit. Esta callback não pode produzir filesystem externo. Depois do commit, publica current/OLD, confere hashes e remove journal antes de anunciar sucesso.

Recovery decide por marker de commit, preservando o journal quando não consegue demonstrar convergência. Se `os.replace` já consumiu um temp, o hash do destino prova a etapa concluída. Todos os payloads necessários são validados antes da primeira troca da recuperação. Commit com erro de I/O ambíguo é consultado pelo marker; se até a consulta falhar, `committed=null` impede afirmar que basta repetir o save. O erro carrega revisões somente quando o commit foi confirmado.

OLD gira somente quando a operação de configuração encontra current anterior válido e configuração realmente diferente. Primeiro current não inventa OLD; metadados/mesma configuração preservam o único backup. Ainda não foi conectado ao botão Salvar nesta tarefa: os testes exercitam o coordenador com DB sintético isolado.

O diretório pode ser definido no JSON local `presets-config.json`, fora do DB. Isso evita que restore altere o caminho desta máquina. Não há transferência de dados automática ao alterar o arquivo; nenhum caminho existente foi movido. API pode ler o protocolo sem importar este checkout. Journals malformados/inacessíveis, snapshots corrompidos e caminhos inválidos ficam indisponíveis em vez de liberar estado parcial. Remoção de resíduos usa somente basenames internos validados, sem exclusão recursiva.

Validação executada: `py -m unittest discover -s tests -p test_presets.py -v`: 17 métodos PASS em 2,370 s (6 codec + 11 store). Inclui três saves, OLD exato, metadados/config idêntica, seis pontos de falha antes/depois commit/current/OLD/finalização, recovery por `initialize` e idempotência, dois escritores com revisão concorrente, lote interrompido após primeiro arquivo, corrupção de snapshot, hash/root/path/duplicata de journal, sentinela externa preservada, DB/diretório inacessível e cleanup órfão após sucesso. Todas as pastas são temporárias em `app/.test-runtime`.

Regressões relacionadas: quatro testes de `test_returns.py` PASS em 0,350 s; quatro testes de produto (save/artefato/backup, biblioteca move/copy/delete, import legado e restore operacional) PASS em 0,493 s. Dan sem bloqueantes e Luda APROVADO na revisão da infraestrutura de 15 testes; os dois testes adicionais de lote/indisponibilidade e limpeza reforçada foram executados depois e comunicados à coordenação. Nenhum reparo PowerShell foi feito. UNC real e queda física de energia não foram exercitados.

Delta final SITE-02: revisão independente aceitou as proteções e os dois testes posteriores, mantendo SEM ACHADOS BLOQUEANTES/APROVADO. Ownership foi liberado para SITE-03.

## SITE-03 — fluxos reais de save e biblioteca

`save_variation` passou a confirmar configuração/metadata/current/OLD pelo coordenador recuperável. Validações existentes e expectedRevision permanecem; a resposta é capturada na própria transação e retornada depois da publicação, evitando responder com revisão de outra aba que tenha salvo logo depois. A edição do frontend continua rascunho até o save.

`library.command` captura snapshots DB antes/depois da mutação na mesma transação e publica somente os IDs cuja configuração, contexto ou metadados mudaram. A operação inteira usa catalogWide, incluindo ancestrais e comandos many. A comparação local mantém a solução simples sem hooks individuais de filesystem para cada comando. Criação/copy geram current novo; rename/move propagam caminho; delete mantém tombstones atuais, inclusive descendentes. Nenhuma dessas operações rotaciona OLD. A criação legada `create_entity` também sincroniza a representação da biblioteca e preserva UUIDs, evitando um caminho antigo que contornaria o produtor.

O backend calcula libraryPath pela cadeia de ancestrais, separada por `/`, com name da própria variação separado. É texto de navegação e não caminho de arquivo. Revisões seguem os incrementos existentes no produto; um rename/move de ancestral atualiza path sem criar incremento fictício em cada descendente. Visibilidade requer que variação e ancestrais estejam ativos.

`publish_xml` coordena fileIndex/revision e metadados do preset depois de gravar o artefato. Houve cuidado específico com falha pós-commit: o arquivo em Gerados precisa continuar existindo se o DB já o referencia. A limpeza anterior foi conservada somente para falha com commit não ocorrido; commit confirmado ou incerto preserva o arquivo para recovery. O teste verifica bytes do artefato após a falha e contador único depois de recuperar.

Fuso efetivo agora pode ser persistido por `save_settings({timeZone})`; fallback America/Fortaleza foi conservado. A troca de fuso atualiza Context/hash de todos os presets sem inserir campo desconhecido na configuração, avançar revisão ou girar OLD. A primeira implementação usava validação lexical; o review encontrou o caso concreto `Mars/Olympus`, que satisfazia o formato e quebraria datas do motor. A coordenação corrigiu a decisão e autorizou a menor expansão de ownership: pyproject, spec, bootstrap de build e notices.

O backend agora valida existência com `ZoneInfo` antes da transação. Foi declarada `tzdata>=2025.2`, a mesma dependência já usada pela API; o spec coleta dados, submódulos e duas licenças, e o bootstrap instala somente essa dependência no venv quando falta. O arquivo `tools/build.ps1` recebeu apenas o bootstrap necessário ao empacotamento; o motor/exportador de arquivos PowerShell não foi alterado. Isso garante dados IANA também num Windows sem banco de fusos instalado. O teste `Mars/Olympus` verifica rejeição sem mudar settings, current ou OLD.

Validação executada: `py -m unittest discover -s tests -p test_presets.py -v`: 23 métodos PASS em 5,573 s, seis novos cenários de integração. Comprovam três saves e OLD anterior exato, snapshot já lido preservado, conflito com rename sem mutação, rename/move ancestral, copy_many/delete_many, tombstone persistente, criação legada com caminho completo, publicação/contador/revisão, fuso sem OLD, save pós-commit recuperado sem repetir e artefato preservado em pending. Regressões: quatro retornos PASS em 0,781 s; cinco testes de produto de persistência/biblioteca/import/restore PASS em 1,172 s.

Gate SITE-03: Dan SEM ACHADOS BLOQUEANTES após correção de fuso; Luda APROVADO COM RISCO limitado ao build frozen ainda não executado. Import/backfill/backup/restore serão conectados pela SITE-04. Os snapshots antigos versus nova leitura foram verificados no produtor; isso não equivale a executar o consumidor API-05, ainda adiado no outro repositório. Não foi feito reparo de exportação PowerShell, mudança de layout ou publicação de release.

Revalidação após correção de fuso: tzdata instalada somente em `app/.venv` (2026.5); a tentativa restrita falhou por DNS e a repetição autorizada fora do sandbox concluiu. `.venv/Scripts/python.exe -m unittest discover -s tests -p test_presets.py -v`: 23 PASS em 4,620 s. Validação de recursos PyInstaller encontrou 605 arquivos de dados, 22 módulos e duas licenças, incluindo America/Fortaleza; spec compila e AST do bootstrap PowerShell não tem erro de sintaxe. Build completo não foi executado nesta task para preservar os releases ignorados já existentes; a verificação final pode usar saída descartável sem passar pela limpeza do bootstrap.

## SITE-04 — backfill, importação, backup e restore

O startup faz recovery do protocolo antes de reconciliar e publicar. Em banco anterior à mudança, a primeira passagem cria um backup SQLite operacional e um ZIP com manifesto e os `current`/`OLD` existentes antes do backfill. O marcador `presets_backfill_v1` torna a primeira geração idempotente: as configurações são normalizadas do DB com mesmo ID/revisão; `OLD` não é inventado. A segunda inicialização mantém bytes, revisão e ausência de OLD.

Importação de workspace agora insere toda a árvore/configuração remapeando UUIDs dentro de uma única operação do coordenador. As respostas e o formato legado do backup não mudam. Os presets derivados recebem os IDs novos, e cópias importadas não criam OLD fictício.

Restore valida hash, integridade, identidade da raiz e schema legado antes da troca. Prepara banco e rollback temporários, registra o marcador no banco staged, deriva presets do estado restaurado e inclui tombstones para `current` que existiam no diretório mas não no backup restaurado. A troca de DB e publicação de XML usam o mesmo journal; se parar depois da troca, journal, rollback e estado necessário são mantidos até o próximo recovery. Após convergir, a limpeza remove somente nomes de staging/rollback com UUID próprio.

Os novos testes encontraram uma corrida na limpeza: chamar a limpeza dentro de toda recuperação apagava o rollback que o restore acabara de criar. A limpeza foi deslocada para o startup e para o preflight do restore antes de criar outro rollback. O teste injeta falha imediatamente depois da troca do DB, verifica que o rollback sobrevive, chama `initialize()` e comprova convergência, tombstone e limpeza. Isso verifica falha controlada; não simula perda física de energia/rede.

Validação SITE-04: `py -m unittest discover -s tests -p test_presets.py -v`: 26 métodos PASS (23 anteriores + backfill idempotente, import com IDs novos e restore/tombstone com interrupção). Testes de produto focados `hierarchy_revision`, `backup_import` e `operational_snapshot_restore`: 3 PASS; quatro testes de `test_returns.py`: PASS. Preservados schema e formato de backup existentes.

## SITE-05 — erro recuperável e preservação do rascunho

Falha do protocolo durante PUT de configuração retorna HTTP 503 com estrutura sanitizada `synchronization` (`pending`, operação, commit conhecido e revisão conhecida). Revisão e caminho local não aparecem quando não comprovados; mensagem não inclui erro interno. Falha de publicação de artefato também usa 503 para que uma geração com commit pendente não pareça um conflito comum.

Foi adicionada `POST /api/variations/{id}/recover`, protegida pelos mesmos controles locais de sessão/CSRF. O handler existente de POST foi preservado para artefato, biblioteca, lifecycle e backup. O endpoint recupera journals e devolve a variação atual. No Studio, o erro mantém o rascunho; o botão Salvar fica bloqueado para impedir reenvio cego e surge uma ação pequena `Recuperar`. Só após a recuperação o cliente compara a configuração enviada à variação do servidor: correspondência limpa o rascunho salvo; divergência preserva as edições como pendentes e atualiza a revisão conhecida. `beforeunload` alerta enquanto houver rascunho/sincronização pendente. Erros do publish mostram a mesma ação e não repetem a geração.

O botão de recovery é criado pelo próprio `studio.js`, sem editar o HTML ou introduzir layout/framework novo. Não foi acrescentado serviço, chamada de rede externa ou dependência. O comportamento de recovery funciona sobre o protocolo local e continua disponível com o Studio fechado; o servidor local já executa recovery no startup e antes das mutações.

Validação SITE-05: teste de contrato do handler exercita 503 sanitizado, revisão conhecida, endpoint de recovery e a rota POST existente de artefatos; PASS. `py_compile` dos módulos Python/testes e `node --check` de `studio-api.js`/`studio.js`: PASS. Regressões focadas: 26 testes preset, 3 testes de produto e 4 retornos: PASS. `git diff --check`: PASS (apenas aviso de conversão de line ending no notice já modificado). Não foi executado smoke visual num navegador nesta continuação.

## SITE-06 — runner local preparado; integração ainda pendente

Foi criado `app/tests/parity_smoke.html` com `parity_smoke.js` para executar o motor existente em navegador real, usando o `DOMParser` e `XMLSerializer` nativos. A amostra cria dois registros XML com namespace e atributo e percorre dois modelos independentes. Compara valores revisados de literal com escaping, cópia de atributo, count, sequence, soma decimal de grupo, compose decimal e data específica; também exige dois irmãos e a separação textual/indentação existente. Não adiciona dependência, servidor ou chamada de rede. A página declara que os resultados aleatórios não fazem parte da comparação.

O smoke não foi executado pelo agente: a política do browser bloqueou explicitamente a navegação `file://` e proibiu contornar o bloqueio por outro protocolo/superfície. `node --check app/tests/parity_smoke.js` confirmou sintaxe, mas não substitui DOM real. O arquivo é reproduzível manualmente ao abrir `app/tests/parity_smoke.html` num navegador local; o resultado só passa a ser evidência executada quando a página mostrar PASS.

Esse runner prepara a validação do produtor Site e não é a paridade do contrato C-PRESET-1: não lê o preset pelo consumidor real, não usa ainda um mesmo fixture compartilhado entre os repositórios, nem executa save→API→save→OLD/fallback. Na data deste registro inicial (27/10), a API consumidora ainda não tinha API-05/08 retomadas; o estado foi atualizado após a continuação de 28/10 na seção abaixo.


## SITE-06 / API-FV — integração do consumidor retomada

Em 28/10/2026, o usuário retomou explicitamente o plano após a implementação do Site e pediu continuação sem Arrowverse/Arrowhead. A API local `staging2` foi criada a partir da `staging` e do `origin/staging`, alinhados em `68bed40f1bbf040cb375d71a65cd953fb4654d8d`. O registro detalhado da implementação/decisões do consumidor está em `mockaize-api/docs/reformulation-execution.md`.

As seis fixtures C-PRESET-1 (`minimal`/`complete`, JSON/XML/SHA) do Site foram comparadas diretamente às cópias no repositório API; todos os arquivos são idênticos byte a byte. O consumidor Python foi ajustado para validar propriedades e caminhos estruturais das fórmulas como o produtor. O validador do journal da API também foi corrigido para aceitar current e OLD do mesmo ID numa operação, formato que o produtor Site realmente gera.

Smoke conjunto executado em diretório `Documents` temporário, sem dados reais: inicialização do storage Site, criação de workspace/pasta/variação pela biblioteca e quatro saves reais via `storage.save_variation`/`preset_store.run_operation`. A API leu o current e gerou o terceiro valor; um snapshot já carregado continuou usando sua revisão depois do save seguinte; a chamada posterior viu o novo valor. A rotação de OLD preservou exatamente a configuração anterior e um rename/metadado não girou o backup.

No mesmo smoke, current ausente fez fallback para a linha do SQLite Site, XML atual permitiu leitura e geração com path de DB inexistente, XML corrompido retornou `PRESET_INVALID`, journal publicado após interrupção sintética bloqueou consulta com `PRESET_SYNC_PENDING` até `preset_store.recover()`, e exclusão de ancestral publicou tombstone que removeu o ID da listagem e respondeu 404, sem ressurreição pelo fallback.

Validação final API em `mockaize-api/staging2`: `python -W error::ResourceWarning -m unittest discover -s tests -q` — 262 testes, 261 PASS e 1 skip legado por privilégio de symlink. API HTTP também testa startup/health/listagem/leitura/geração XML-only e falha explícita para current inválido. Os arquivos OpenAPI/README/Bruno foram sincronizados com o comportamento novo. O configurador API concede leitura (RX) ao `NetworkService` em `presetsDirectory` local customizado, sem permissão de escrita; teste dedicado e 28 testes `test_windows_ops.py` passaram. O padrão coincide com o diretório `Documents/MockAíZé/Presets` do Desktop.

O smoke visual com `DOMParser`/`XMLSerializer` continua não executado. A tentativa anterior foi bloqueada pela política local do browser para `file://`, que também não permite contornar por outro protocolo/superfície. `node --check` e os testes de engine não substituem a execução DOM real; portanto não declaro o gate visual SITE-FV completo. Também não foi feita instalação nativa do serviço com caminho customizado, build/release da API ou revisão externa independente. Nenhum dado real ou serviço instalado foi alterado nesta retomada.

### Aditivo SITE-FV — regressão do runner PowerShell

Ao executar a suíte Desktop completa, os testes do runner standalone revelaram que a configuração normalizada do modo Filtragem contém `fileName` e `filename`, nomes semanticamente distintos mas equivalentes para a desserialização de objetos do PowerShell 5.1. O runner de exportação só implementa os modos New/Return e não consome `filter`, `filterPresets`, `activeFilterPresetId` ou `manual`; ainda assim, embutia essas seções não relacionadas no JSON e falhava antes da geração.

`serialize_runner_config` agora remove essas quatro seções somente do JSON embutido no runner; a configuração completa permanece no SQLite e no preset C-PRESET-1. `create_bundle` usa esse serializador e os testes de execução usam o mesmo caminho de preparação. Nenhum conteúdo de New/Return foi removido. Isso mantém o escopo simples e preserva a exportação que o SITE-06 exige verificar.

Validação após a correção: `python -W error::ResourceWarning -m unittest discover -s tests -p test_product.py -q` — 18 PASS; assets web em loopback — 2 PASS; `test_presets.py` — 26 PASS; `test_returns.py` — 4 PASS; suíte completa Desktop — 50 PASS. O teste de assets e a suíte completa foram executados com permissão local para os sockets em `127.0.0.1`. O runner standalone PowerShell 5.1 foi executado pelos testes; não houve instalação nem alteração do PowerShell do sistema.


## Revisão corretiva solicitada — 28/10/2026

Revisão direta dos diffs e módulos novos dos dois produtos: codecs/fixtures, journal/commit/recovery, storage/biblioteca/import/restore, erros HTTP, estado frontend, runner PowerShell, catálogo/fallback/contexto do motor e empacotamento/permissões. Sem Arrowverse/Arrowhead ou agentes adicionais. Aplicada a skill surgical-patch para manter as correções ligadas a defeitos concretos e regressões específicas.

### Correções Desktop

1. **OLD e reconciliação confundiam tipos JSON.** Python considera False == 0 e 1 == 1.0; comparar dicionários podia ignorar uma edição real em dados JSON livres. A rotação de OLD e a reconciliação agora comparam a serialização canônica tipada do contrato. Regressão salva booleano e depois número, comprovando bytes exatos do OLD e tipo do current.
2. **Produtor aceitava metadados rejeitados pela API.** O codec agora rejeita IDs físicos inválidos/reservados e contextos com fuso inexistente usando ZoneInfo. As fixtures e o formato C-PRESET-1 foram preservados.
3. **Publicação Manual/Filtragem não habilitava recuperação da tela.** Um único publishSnapshot agora registra a pendência de sincronização e propaga a falha em todos os modos. Assim, o usuário recebe o botão Recuperar e não pode repetir cegamente uma mutação já commitada.
4. **Recuperação podia contornar conflito de outra aba.** A revisão remota era atribuída incondicionalmente ao rascunho. Agora revisão/fileIndex só avançam quando o conteúdo recuperado corresponde à tentativa pendente. Caso outra aba tenha salvo conteúdo diferente, o rascunho mantém sua revisão esperada para que o próximo save detecte o conflito. Edições locais feitas enquanto a recuperação aguarda também são preservadas.
5. **Falhas de sincronização escapavam dos handlers HTTP.** Biblioteca, importação, backup, restore, criação legada e settings agora retornam 503 JSON com commit conhecido e mensagem sanitizada. Para operações sem variação específica, a orientação é fechar e abrir o Desktop para executar a recuperação já existente no startup antes de repetir. Uma regressão cobre os seis endpoints, inclusive falha pós-commit.
6. **Temporário Windows com capitalização diferente bloqueava recovery.** A suíte revelou UUID/sufixo em maiúsculas num temporário não publicado. O reconhecimento do sufixo agora ignora caixa nos dois produtos; a limpeza Desktop continua restrita a UUID válido dentro de .sync. A API continua sem escrever. Journals publicados mantêm validação integral.
7. **Journal excessivamente aninhado escapava como RecursionError.** pending/recover agora convertem a falha em PresetSyncError, preservando o journal. A regressão verifica que a pendência não é apagada.

### Manutenção e escopo

A publicação frontend foi centralizada para reduzir caminhos de erro diferentes. O retry limitado de limpeza Windows existente em test_product foi extraído para runtime_support e reutilizado nas suítes de presets/retornos. Isso resolve WinError 145 observado em teardown: só WinError 32/145 são repetidos, com limite, validação de alvo dentro de .test-runtime e propagação de falhas persistentes.

Os codecs permanecem separados por produto para preservar versões e empacotamentos independentes, com fixtures compartilhadas para compatibilidade. Não foi criado pacote comum, cache persistente ou framework. A revisão API corrigiu concorrência no fallback/listagem, fuso vindo de user_settings e libraryPath consistente com o produtor; detalhes no diário API.

### Validação final

- Desktop: 55 testes PASS, com python -W error::ResourceWarning -m unittest discover -s tests -q e acesso local aos testes HTTP de loopback.
- API: 267 testes, 266 PASS e 1 skip legado por privilégio de symlink, também tratando ResourceWarning como erro.
- Node preset_sync.cjs: PASS para publicação com falha, conflito entre abas e preservação de edição durante recovery. Executa handlers reais em contexto controlado; não substitui validação DOM.
- Testes Node existentes de retornos, datas e alerts: PASS. Sintaxe studio.js e diff --check Desktop: PASS.
- Diff --check API: PASS excluindo o Bruno preexistente do usuário, que contém whitespace anterior. Hash Git desse arquivo preservado: fa05a33f58b8f9a270f185d9f6c82fb64c8ebbee.

O smoke visual DOM anteriormente bloqueado permanece pendente. Não houve build/release ou instalação nativa de serviço nesta revisão. Branches staging2 preservadas; sem commit/push.

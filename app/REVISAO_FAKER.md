# Revisão da implementação Faker — 29/10/2026

Referência: `docs/refino/mockaize-catalogo-faker-cards.md`, cards C01–C15. Revisão do diff da branch `dev` e dos consumidores existentes, sem agentes.

## Problemas corrigidos

| Área / cards | Problema observado e correção |
| --- | --- |
| Catálogo / C01–C02 | Manifesto criava Faker repetidamente por método. Agora utiliza uma instância por consulta. Validação rejeita IDs de tipos compostos, versão booleana e opções inválidas com erro controlado. Mínimo de texto ajustado ao provider. |
| Perfis / C03, C05–C06 | Dividir lotes quebrava a identidade entre atributos do mesmo perfil. A semente de operação deriva perfis estáveis entre blocos e ordens distintas. Logradouro, número e endereço completo agora compartilham os mesmos componentes. |
| API local / C04–C06 | Uma instância Faker por perfil aumentava custo proporcionalmente aos registros. Uma instância isolada por requisição atende o lote; prazo de 15 segundos e limite de saída restringem o processamento. Testes HTTP reais conferem sessão, CSRF, no-store e erros 400. |
| Motor / C07, C10 | Coletor chamava funções privadas de outra closure, causando ReferenceError. Usa agora a API explícita do motor. Ignora campos fixados e solicita nome apenas uma vez. |
| Editor / C08–C09 | Validação de parâmetros também ocorre no cliente. Mudanças em fórmulas Faker atualizam amostras com debounce; respostas de outra configuração ou seleção são descartadas. Detecção recursiva de Faker compartilhada entre módulos. Perfis sintéticos JS redundantes foram removidos; fórmulas legadas usam o mesmo resolvedor e verificam chaves próprias do mapa. |
| Manual / C11, C13 | Coleta multiplicava fórmulas de todos os campos por todos os registros. Cada campo agora usa seu índice. Ao adicionar registro, apenas referências estruturais são reindexadas; nomes de perfil permanecem intactos. Semente persistida mantém coerência ao reabrir. Revisões invalidam respostas pendentes imediatamente. Erros na confirmação são apresentados e confirmações simultâneas são bloqueadas. |
| Filtragem / C12 | Cálculo usa snapshot candidato e só substitui o resultado após concluir nome e XML. Falhas preservam o último resultado válido e bloqueiam exportação. Exportação tem trava antes da primeira espera assíncrona. |
| Desktop / C15 | Consulta do nome do mutex podia deixar erro Win32 anterior e simular instância já existente. Limpeza de last-error agora ocorre imediatamente antes de CreateMutexW; assinatura de CloseHandle explicitada. |
| Capacidade | Limite aumentado de 500 para 10.000 registros por XML em UI, motor, Manual, persistência e script PowerShell. Operações Faker aceitam até 250.000 fórmulas, enviadas em blocos de 2.500. Teto de XML de saída continua em 100 MB. |

## Evidência e limites da revisão

Resultado da rodada completa: **76 testes Python passaram**, incluindo o executor dos testes Node; verificações de sintaxe dos cinco arquivos JavaScript alterados e `git diff --check` passaram. O build Windows terminou com sucesso e gerou `app/dist/MockAiZe-0.1.13.exe` (18.101.389 bytes). Após a remoção dos perfis JS redundantes, os testes Node foram executados novamente e passaram.

Testes Python cobrem catálogo, conversões, perfis entre blocos, limites, prazo, 10.000 registros de dados Faker e validação HTTP. Testes Node executam os módulos reais do motor e Manual, incluindo coleta de fórmulas legadas, campos fixados e cópia de registros com perfil. O teste de mutex usa uma regressão controlada de erro Win32.

A geração de 10.000 valores não representa uma medição de todos os formatos de XML: custo e memória dependem do modelo e das fórmulas. O cancelamento do navegador interrompe a espera e impede publicação; o processamento do servidor pode prosseguir até concluir o bloco ou atingir seu prazo. Uma chamada individual síncrona ao provider termina antes da próxima verificação de prazo.

A API externa em `mockaize-api` não recebeu código Faker na implementação anterior: depende apenas de tzdata e tem intérprete próprio. Sua política já suporta limite de registros customizado ou desativado. Compatibilidade de presets com fórmulas Faker nessa API continua sendo uma entrega separada; a API local do desktop foi revisada e testada aqui.

## Correção da prévia de presets anteriores ao Faker

Reprodução no navegador com caminho `RzSocCorresp`: o editor resolvia somente o registro zero, mas `testFormula` recalculava a prévia com todos os registros quando havia soma global. Os registros seguintes falhavam com “O valor Faker não foi resolvido para este registro”. Agora `formulaPreviewConfig` define uma única configuração de prévia, e `testFormulaAsync` resolve Faker e gera o XML usando essa mesma configuração. Testes de referências à saída também entram na resolução assíncrona quando dependem de regras Faker.

A regressão reproduz a mensagem original e passa em dez cenários reais de navegador: pessoa/empresa/endereço legados, Faker novo, composição, soma global e modos Novos registros/Retorno. A suíte Python passou nos 76 testes com mutex de QA isolado da instância desktop em execução. O executável local foi regenerado. O teste opcional `tests/faker_preview_browser.cjs` utiliza Playwright e Edge headless; `MOCKAIZE_PLAYWRIGHT_MODULE` permite indicar a instalação do Playwright.

O ciclo visual completo dos quatro modos dentro do executável instalado, sem rede, continua sem evidência de execução nesta revisão. Build e testes de módulos/HTTP não substituem esse aceite de C15. Assim, a declaração anterior de todos os cards concluídos deve ser entendida como cobertura de implementação, não aceite integral comprovado.

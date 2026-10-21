# Revisão dos componentes — staging

Data: 21/10/2026. Base: `ce3bcf5`. Referência visual: protótipo aprovado `mockaize-navbar-menus-completo.html` e decisões da conversa, consolidadas em `docs/navigation-design.md`.

## Padrões e exceções

- Navbar por menus aprovada: workspace, Biblioteca, Estúdio e Ferramentas; sem lateral esquerda. Operações continuam no menu de duas colunas. Ferramentas contém Carregar XML, Campos e grupos e Baixar scripts.
- Select/combobox pesquisável, Date Picker 03, Pagination 03, Sheet 03 e Form 10 continuam adaptados à aplicação vanilla, sem trocar a arquitetura por React.
- Espaçamento fixo em múltiplos de **8 px**. Bordas, contornos, tipografia e raios são valores ópticos. Campo: 8 px antes do rótulo, rótulo persistente, 8 px entre rótulo/controle e 8 px depois do controle.
- Mantidos por pedido explícito: XMLs, conexões, sincronização, paginação, fórmulas e comentários, nome de arquivo dedicado, operações/presets, seleção de retornos/ZIP, indicador no rodapé, disquete sem texto Salvo, Manual/Formulas na mesma linha de Adicionar registro, Confirmar à direita, filtros inicialmente fechados com arraste e E/OU, organização de diretórios com checklist e ações por ícone/texto.

## Inventário e correções

| Área | Revisão | Correção |
|---|---|---|
| Início | Criação, selects, botões, rótulos e validação | Campos de 40 px, raio compartilhado, espaçamento e erros acessíveis |
| Biblioteca | Tabela, checklist, pesquisa, menus, criação/renomear/copiar/mover/excluir | Separação de 8 px do menu, campos e botões no tema claro, seleção e ação destrutiva com tokens comuns |
| Navbar | Workspace, operações, arquivos, Ferramentas, busca e estados vazios | Semântica de menu nos itens; mantido o modelo aprovado |
| Novos registros/Retorno | Operação, grupo, edição, geração/exportação e alertas | Removido padding superior zero; 8 px acima do nome e abaixo do campo |
| Manual | Campos, fórmulas inline, confirmação e exportação | Mesmo contrato de campos, erros 25 associados ao controle; geometria aprovada mantida |
| Filtragem | Condições, conectores, presets e erro da prévia | Campos compartilhados, erro 25, retorno de sucesso 23 e atenção 24 |
| Fórmulas/arquivo | 20 geradores de campo, nome do arquivo, comentários e limites | Rótulos associados também nos controles dinâmicos; espaço em limites; foco completo nos selects |
| Calendário/paginação/sheets | Controles, navegação por teclado, inspetor e modais | Mantidas variantes pedidas; descrições de data e foco preservados |
| Carregar XML | Colar/editar, importar, conteúdo inválido e status | Erros 25 sem apagar edição; confirmação de arquivo carregado 23 |
| Mensagens | Sucesso, erro, atenção e informação | Componente compartilhado `AppAlerts`, sem adivinhar severidade a partir do texto |

## Alertas 23–26

Fonte: [Shadcn Studio Alert, Base](https://shadcnstudio.com/docs/components/alert?base=base). Conferidos nos elementos `data-slot="alert-23"` a `alert-26` do [preview oficial](https://shadcnstudio.com/preview/components/base/alert?index=0).

| Variante | Uso | Aparência |
|---|---|---|
| 23 | Sucesso | CheckCheck, verde suave, título e descrição |
| 24 | Atenção | CircleAlert, âmbar suave, título e descrição |
| 25 | Erro | TriangleAlert, vermelho suave, título e descrição |
| 26 | Informação | CircleAlert, fundo primário preenchido e texto contrastante |

Padding de 16 px e gaps de 8/16 px adaptam a referência à grade pedida. Erros e avisos persistem até fechar. Mensagens transitórias pausam sob o ponteiro ou foco. Conteúdo de mensagens é escapado; erros têm `role=alert`, confirmações `role=status` e ajuda estática `role=note`. Erros inline mantêm o conteúdo digitado e associação com o campo.

## Evidências de validação

- Edge/Playwright com uma cópia dos dados do protótipo em memória: 4 operações × larguras 1720, 960, 390 e 320 px. Sem overflow horizontal da página, rótulos ausentes ou valores de espaçamento fora da grade nos controles visíveis auditados. O fixture fica no navegador; não acessa o banco do usuário.
- 20 geradores de campo percorridos: template, copy, literal, cpf, cnpj, date, zeros, sequence, alpha, random, id, hash, list, person, company, address, compose, count, field e groupSum. Sem erros JavaScript, controles sem nome ou overflow do inspetor.
- Temas claro/escuro inspecionados com alertas; biblioteca e diálogo de criação no claro.
- Condições inicialmente fechadas, abrir/recolher e reordenar com setas; menus, busca sem resultados, combobox sem resultados, calendário com teclado, sucesso ao salvar, XML inválido preservado, importação de arquivo e confirmação do carregamento.
- Validação nativa: alerta 25, `aria-invalid`, foco e limpeza do erro após correção. Alertas: texto HTML escapado, fechar, persistência de erros e estados 23–26.
- Testes Node existentes de datas e retornos passaram; novo `component_alerts.cjs` cobre severidade, semântica, escape, título e ocultação. Testes HTTP/empacotamento dos três assets em `test_component_assets.py`.
- `node --check` de todos os arquivos JS e `git diff --check`.

## Limitação da suíte geral preexistente

A suíte Python de 21 métodos terminou com 18 métodos aprovados e 3 falhando (20 falhas contando os subcasos). Todos os erros são do exportador PowerShell: `ConvertFrom-Json` rejeita as chaves `fileName` e `filename` no mesmo objeto. Reproduzido com `server.py` original de `HEAD` e módulos de exportação/storage sem alterações. Não é regressão desta revisão de componentes; a correção do exportador permanece pendente. Não houve alteração na lógica de geração/persistência nesta revisão.

Capturas e relatórios detalhados ficaram no diretório local de visualizações desta conversa (`review-*.png`, `component-layout-audit.json`, `component-formula-audit.json`). A validação visual usa preview estático com API isolada; não equivale a validar todos os fluxos de persistência na instalação Windows.

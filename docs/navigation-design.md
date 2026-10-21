# Navegação aprovada

Implementada na branch `staging`, baseada na `dev`. A referência é o protótipo HTML `mockaize-navbar-menus-completo.html`, aprovado nesta conversa.

## Estrutura

- Navbar compartilhada: marca para Início, workspace, Biblioteca, Estúdio, Ferramentas, busca, armazenamento local, tema e ajuda. Sem lateral esquerda.
- Biblioteca em duas colunas, com diretórios reais, abertura de arquivos e ações existentes. Organizar biblioteca mantém a tabela, seleção múltipla e movimentação por arraste.
- Estúdio e seletor de operação usam o mesmo menu com Novos Registros, Retorno, Filtragem e Manual.
- Ferramentas contém apenas Carregar XML, Campos e grupos e Baixar scripts. Histórico fica no contexto do arquivo.
- Fórmula do nome, seleção dos retornos e Salvar com disquete ficam juntos. Sem indicador textual de salvo. O indicador de geração permanece no rodapé.

## Espaçamentos e edição

- Margens, espaçamentos e preenchimentos fixos em múltiplos de 8 px. Bordas, contornos e tipografia usam valores ópticos.
- Operação com largura padronizada; seletores de grupo compactos e alinhados à direita.
- Cabeçalhos dos XMLs em uma linha. A prévia fica no topo à direita; sem os botões Estrutura/Modelo e Ver completo e sem as tags da entrada.
- Prévia, conexões entre campos, sincronização de rolagem e paginação mantêm os componentes e regras atuais.
- Inspetor mantém Valor e Comentários. Nome do arquivo abre apenas pelo botão dedicado.
- No Manual, Adicionar registro e o seletor Manual/Fórmulas ficam na mesma linha; Confirmar preenchimento tem altura de 32 px e fica à direita.
- Filtragem mantém condições recolhidas, reordenação, conectores E/OU e Desfazer. Presets ficam ao lado de Carregar XML, com adicionar entre salvar e renomear.
- Rodapé compacto com Registros, Gerar registros, indicador e Exportar XML. Retornos múltiplos continuam gerando um ZIP.

## Integração

A navegação usa as APIs reais, não os dados ou a persistência isolada do protótipo. Arquivos estáticos novos estão no servidor e no empacotamento Windows. A preferência legada de largura da lateral continua válida para compatibilidade de configurações e backups, mas não ocupa espaço na interface.

## Ajuste dos cabeçalhos de prévia

- Manual e Filtragem usam cabeçalhos em uma linha, com títulos alinhados entre os dois painéis e sem as faixas auxiliares de texto abaixo.
- Removidos Atualização em tempo real, status textual do XML filtrado, Cabeçalho compartilhado e a explicação da prévia manual. Erros e resultados continuam nos componentes próprios e no rodapé.
- No Manual, Grupo do registro permanece compacto e alinhado à direita da barra; carregamento e contagem ficam à esquerda. Novos registros e Retorno mantêm os seletores à direita conforme o padrão aprovado.

## Exclusões na prévia da Filtragem

A prévia mostra por padrão o XML original com os grupos excluídos destacados em vermelho. Ver XML final alterna para o conteúdo filtrado sem marcações; Mostrar excluídos retorna à revisão. A exportação continua usando somente o XML filtrado, independentemente da visualização. Não reintroduzir faixas auxiliares nos cabeçalhos.

# MockAíZé

Aplicativo local para organizar modelos XML, configurar regras de geração e criar arquivos de teste. O MockAíZé abre sua interface no navegador padrão e mantém um ícone na área de notificação do Windows enquanto estiver em execução.

## O que já funciona

- Manual começa com um registro, independentemente da quantidade importada. Adicionar registro abre uma página vazia; anterior/próximo navegam sem empilhar os formulários. O cabeçalho é compartilhado, o grupo pode ser escolhido e a exportação inclui somente os registros adicionados. Quantidade e preenchimentos são persistidos.

- Digitação no modo Manual atualiza somente o valor correspondente na prévia, preservando os outros nós e a rolagem. Comparação completa de alterações ocorre após uma pausa, e os avisos ao servidor são enviados ao mudar o estado ou no heartbeat.

- Operação Manual: importa a estrutura da entrada com valores vazios, oferece campos para cabeçalho e cada ocorrência dos registros, guias de formato, prévia ao digitar, confirmação e exportação do XML preenchido. O modelo e os valores são salvos separadamente de Retorno e Novos registros; os marcadores da prévia não são exportados.

- Workspaces com pastas e subpastas livres. Criação, renomeação, movimentação, cópia e exclusão com confirmação pela lateral ou pelo organizador de diretórios. A hierarquia antiga é migrada preservando os arquivos.
- XML completo e fórmulas persistentes, independentes para Retorno e Novos registros. Salvar inclui o XML carregado e a edição pendente do campo. Reabrir o app retoma o último arquivo. Edição, importação e validação sintática de XML (sem executar esquemas XSD).
- Comentários contextuais por linha, posição de rolagem preservada ao aplicar regras, sincronização opcional dos XMLs e vínculos indicados nas bordas quando um campo sai da área visível.
- Edição de fórmulas no painel ou em modal; navegação e painel de fórmulas redimensionáveis, com preferências salvas no SQLite.
- Cabeçalhos únicos por operação, separados da tag repetida dos registros, com fórmulas nos campos internos; mesma configuração no XML gerado e no motor PowerShell.
- Estúdio de geração com o layout de `base/mock-studio.html`: XMLs lado a lado, vínculos por arrasto ou seleção com linhas de conexão, sintaxe colorida e inspetor de campos à direita.
- Cores do XML por tema: tags verdes e valores brancos no escuro; tags azuis e valores vermelhos no claro.
- Retorno com uma saída por registro importado, mantendo os valores de cada ocorrência nos mapeamentos, inclusive em configurações antigas.
- Mapeamento de campos por caminho XML, regras por operação, políticas de presença de elementos e atributos, valores fixos e tamanho exato.
- Preservação de comentários, instruções de processamento e seções CDATA não editadas durante a geração; ao editar o valor de um campo misto, o conteúdo textual é atualizado sem apagar comentários e instruções irmãos.
- Soma de um campo em todas as ocorrências de um grupo, na entrada ou na saída, respeitando o pai de cada registro; valores calculados são reutilizados.
- Catálogo de fórmulas para texto, cópia, sequencial, data, CPF/CNPJ, valores aleatórios, listas, identificadores, perfis sintéticos e composição.
- Geração, prévia, download e histórico de XMLs; limite de 2 MB para XML de entrada e 100 MB para artefato de saída.
- Exportação offline de um par PowerShell 5.1 (`.ps1` + `.bat`) para uma variação salva.
- Exportação/importação de workspace em JSON, snapshots SQLite consistentes e restauração com rollback.
- Temas claro e escuro, seleção lembrada, proteção contra sobrescrita e aviso para alterações pendentes ao sair pela bandeja.

## Onde ficam os dados

Todo o estado do produto fica em `Documentos\MockAíZé`, usando a pasta Documentos conhecida do Windows para respeitar redirecionamentos. Isso inclui o SQLite, manifesto de identidade, XMLs gerados, snapshots, exportações PowerShell e arquivo de rendezvous da instância. O aplicativo não escolhe `%AppData%` nem `%LocalAppData%` para guardar dados do produto.

Se já existir conteúdo nessa pasta sem um manifesto válido, o aplicativo interrompe a inicialização para preservar os dados e pede recuperação; ele não adota nem substitui silenciosamente um banco desconhecido.

## Executar a partir do código-fonte

Requisitos: Windows 10/11 e Python 3.11 ou mais recente.

Execute os comandos abaixo dentro da pasta `app`, que contém todo o projeto Python, ferramentas, testes, recursos e builds. Na raiz do repositório ficam apenas esta documentação e os avisos de licença.

```powershell
py run.py
```

O código-fonte da aplicação fica em `app/mockaize`. O servidor escuta apenas em `127.0.0.1` numa porta local escolhida pelo sistema. Não há serviço remoto nem dependência de rede para gerar XML. Feche o processo pelo menu do ícone do MockAíZé na área de notificação.

## Empacotar no Windows

O build é feito no próprio Windows e mantém ambiente virtual, intermediários e saída dentro de `app`. A primeira instalação do PyInstaller precisa de acesso ao índice configurado do Python Package Index.

```powershell
tools\build.cmd
```

O script gera um único executável portátil em `dist\MockAíZé-0.1.13.exe`; a pasta `dist` fica sem `.pkg` e sem DLLs ao lado do executável. O PyInstaller extrai componentes do runtime temporariamente durante a execução; nenhum dado persistente do produto vai para essa pasta. SQLite, XMLs, snapshots, exportações e demais dados continuam em `Documentos\MockAíZé`. O PNG é usado na página e como favicon; o ICO correspondente é usado pela bandeja e pelo executável. A aba do navegador padrão continua sujeita às regras visuais dele. O executável incorpora os avisos do runtime; revise [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ao trocar a versão de Python/PyInstaller.

O runner PowerShell aceita `-InputFile`, `-OutputDirectory`, `-Count`, `-BaseDate` (`AAAA-MM-DD`) e `-FileIndex`; sem overrides, usa a configuração congelada no momento da exportação.

## Verificações locais

```powershell
py -m unittest discover -s app\\tests -v
node --check app\\mockaize\\web\\app.js
node --check app\\mockaize\\web\\engine.js
```

Os testes automatizados cobrem persistência, isolamento da raiz, concorrência por revisão, validação XML, importação, snapshots, bundle PowerShell e sintaxe do runner. Testes unitários não substituem uma validação visual em navegador, execução completa do PowerShell 5.1 ou smoke test do executável em uma máquina limpa.


## Estrutura do repositório

- pp/ — código-fonte, assets, testes, ferramentas e empacotamento do aplicativo.
- README.md — documentação principal.
- LICENSE — licença do projeto.
- THIRD_PARTY_NOTICES.md — avisos de dependências.

## Código e licença

O código do projeto é distribuído sob MIT. Veja [LICENSE](LICENSE). O núcleo de runtime usa módulos da biblioteca padrão do Python e APIs Win32 chamadas via `ctypes`; o empacotamento opcional usa PyInstaller. Revise e distribua os avisos das ferramentas de build junto com qualquer release.


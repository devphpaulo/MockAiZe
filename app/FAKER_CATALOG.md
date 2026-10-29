# Catálogo Faker do site MockAiZe

## Contrato

- Dependência fixada em `Faker==40.44.0`, locale `pt_BR` e catálogo versão `1`.
- As 16 categorias do editor estão em `mockaize/faker_catalog.py`. O manifesto é consultado por `/api/faker/catalog`; cada item tem ID estável, rótulo, método, assinatura observada e parâmetros que a interface permite alterar.
- O navegador envia IDs catalogados. O servidor rejeita métodos, propriedades e valores de parâmetro não permitidos antes de chamar Faker.
- Cada resultado vira um único texto XML. Strings e escalares usam sua representação textual; bytes usam UTF-8 com substituição; datas usam ISO 8601; listas e tuplas usam ` | `; conjuntos são ordenados antes da junção; objetos recebem JSON UTF-8 com chaves ordenadas. Tipos sem conversão definida e valores acima de 4.096 caracteres falham com erro.
- Os parâmetros configuráveis são deliberadamente limitados: contagem/tamanho nos geradores de texto e UF nos dados de endereço. A assinatura completa do provider é publicada para manutenção; argumentos fora de `parameters` não são aceitos em fórmulas.

## Cobertura e exceções

Os métodos públicos dos providers das categorias selecionadas estão no catálogo ou em `INTERNAL_EXCLUSIONS`. CPF e CNPJ continuam nos geradores próprios do MockAiZe; `lorem.get_words_list` é um helper de construção utilizado pelos métodos de texto e não uma opção autônoma. Providers das demais categorias não aparecem no editor.

## Perfis e presets existentes

Pessoa, empresa e endereço antigos são lidos como fórmulas Faker sem reescrever o preset. Pessoa e e-mail usam o mesmo perfil de registro/grupo; empresa e e-mail corporativo compartilham o nome gerado e um domínio reservado `.example.test`. O endereço reutiliza os componentes do mesmo perfil. Se a fórmula antiga tinha UF fixa, ela é carregada como parâmetro; na opção aleatória, uma UF e sua capital são escolhidas uma vez por perfil. CEP é sintético e não é validado contra correspondência postal.

Os valores exibidos por presets antigos podem mudar porque a fonte dos dados mudou. Salvar continua guardando a fórmula e não a amostra.

## Limites de execução

- Até 250.000 fórmulas por operação, resolvidas no navegador em blocos de até 2.500; até 10.000 registros por XML, respeitando também os limites preexistentes de tamanho da solicitação e do XML.
- O lote do servidor aceita até 25.000 itens, tem prazo de 15 segundos e até 16 milhões de caracteres de saída; ele é all-or-nothing. Cancelar aborta a solicitação em andamento e impede a publicação do snapshot incompleto.
- Catálogo, amostra, lote e dados Faker ficam no processo local; a distribuição inclui os providers e dados da dependência.
- A exportação de executáveis PS1/BAT é recusada pelo servidor quando o preset contém Faker, inclusive fórmula aninhada e perfil antigo. XML pronto continua exportável pelo estúdio.

## Escopo da integração

Faker está integrado aos modos Novos registros, Retorno, Manual e à fórmula de nome do modo Filtragem. Filtragem continua alterando apenas o nome; suas regras XML permanecem as regras já existentes. A API compatível externa tem contrato separado e não é alterada por esta implementação do site.

## Perfis entre lotes e cache Manual

O navegador envia uma semente de operação junto de cada bloco. O servidor deriva uma semente por registro/família/grupo/UF: dividir o lote ou mudar a ordem dos atributos não muda o perfil. Cada requisição utiliza uma única instância isolada de Faker, sem compartilhar RNG entre threads. A semente do Manual é persistida em `manual.fakerSeed` para preservar relações entre campos depois de salvar e reabrir, junto do cache de valores já existente. Nos outros modos ela dura uma geração.

O coletor ignora regras fixadas, resolve o nome somente para o registro zero e, no Manual, associa cada fórmula ao índice do seu próprio campo. A API externa standalone usa contrato e política próprios; seu limite de registros já permite configuração `custom` ou desativação. Esta alteração aumenta o limite do aplicativo desktop e de sua API local.

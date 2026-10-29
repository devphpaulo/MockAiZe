# C-PRESET-1 — contrato executável do preset

Versão 1, 27/10/2026. Produtor: Desktop. Consumidor: futura API-05.
Fixtures sintéticas versionadas em `app/tests/fixtures/preset-v1/` devem ser copiadas byte a byte para o consumidor e ter seus hashes conferidos antes de declarar integração. A instalação não depende do checkout vizinho.

## Envelope e tipos

XML UTF-8 com declaração, indentação de dois espaços e LF final. Raiz `MockAiZePreset`, namespace `urn:mockaize:preset:1`, atributos exatos `schemaVersion="1" engineSpecVersion="1" format="xml"`. Filhos em ordem: `Metadata`, `Configuration`, `Context`, `PayloadHash algorithm="sha256"`. Os três primeiros têm exatamente um `Value`.

`Value kind="object"` contém `Property name="..."` com exatamente um `Value`; chaves únicas e ordenadas na escrita. `array` contém `Item` com um `Value`, conservando a ordem. `string` conserva texto, espaços, tabulação, CR/LF, vazio e Unicode; CR é escrito como referência numérica para sobreviver à normalização XML. `boolean` aceita somente `true`/`false`; `null` não tem conteúdo; `number` aceita a gramática JSON finita, sem converter strings numéricas. Caracteres proibidos no XML 1.0, tipos Python não JSON, comentários/PI internos, atributos/elementos inesperados e duplicatas são inválidos. DOCTYPE/ENTITY e codificações diferentes de UTF-8 são recusados antes do parse, inclusive UTF-16 com NUL.

`formula` contém uma tag do catálogo de 20 tipos e parâmetros em `Property`. Reconhecimento somente nas posições do normalizador: `rulesByMode.{new,return}.*.generator`, `filenameByMode.{new,return}`, `filter.filename`, `filterPresets[].filter.filename`, `manual.filename`, `manual.formulas.*`, `returnModels[].rules.*.generator` e `returnModels[].filename`. `compose.parts[]` contém outras fórmulas. Um objeto `type` em notas permanece objeto comum. Fórmula não vazia nessas posições exige a representação `formula`; o objeto vazio de filename por modo permanece compatível com o normalizador.

## Payload, validação e hash

Metadata contém exatamente `id`, `name`, `libraryPath` (strings), `revision` (inteiro >=1), `fileIndex` (inteiro >=0), `active` (boolean). Context contém exatamente `timeZone` (string não vazia), sem inseri-lo no JSON normalizado. A validação semântica do fuso efetivo pertence à integração de settings/motor.

Configuration é a configuração completa já normalizada por `storage.normalize_config`, incluindo filter/manual e todos os modelos. O codec valida numa cópia e exige igualdade; não normaliza silenciosamente um preset externo incompleto. Mantém limites editoriais atuais por modelo/config, sem aplicar teto HTTP de 2 MB ao documento de preset agregado.

SHA-256 de UTF-8 de `json.dumps({"metadata": metadata, "configuration": configuration, "context": context}, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)`. Sem hash dentro do payload. Números seguem a serialização Python, inclusive distinção textual entre `1` e `1.0`; ambos codecs desta integração são Python. Codec futuro em outra linguagem deve provar esses mesmos vetores. Hash verifica integridade, não autentica.

API local: `encode_preset(metadata, configuration, context) -> bytes`; `decode_preset(xml: bytes|str) -> {metadata, configuration, context}`; `payload_hash(...) -> str`; falhas explícitas `PresetError(ValueError)`. Codec não escreve arquivos ou consulta banco. Nome físico por ID e pending/journal pertencem à SITE-02; verificação ID versus nome físico pertence ao consumidor/store.

## Corpus e evidência

`minimal` fixa defaults completos; `complete` cobre todos os 20 tipos de fórmula, compose decimal, dois modelos, dois registros de entrada com namespace/atributo, notas com false/null/zero/fracionário/string vazia/objeto type arbitrário, Unicode e caracteres escapáveis. Cada caso tem JSON lógico esperado, XML e SHA-256 do payload. O JSON e o hash são conferidos por cálculo independente no teste; o corpus ainda não é evidência de execução do motor da API.

Comando: `cd app; py -m unittest discover -s tests -p test_presets.py -v`. A suíte também verifica todos os modos, múltiplos templates acima de 2 MB e rejeições de estrutura, versão, tipo, hash e DTD. Geração, seleção de fonte, OLD e recuperação são gates posteriores.

## Protocolo físico de sincronização V1

O diretório padrão é `<data_directory()>/Presets`. Opcionalmente, o arquivo local `<data_directory()>/presets-config.json` contém exatamente `{"presetsDirectory":"caminho absoluto"}`. Aceita caminho Windows/UNC; o arquivo fica fora do SQLite, portanto restaurar um banco não muda o destino configurado nesta máquina. Configure com o Desktop fechado e mantenha o conjunto anterior como backup; esta infraestrutura não move pastas. O consumidor API deve usar o mesmo diretório. Presets, OLD, `.sync` e temporários ficam fora de qualquer limpeza de artefatos.

Arquivos públicos: `<id>.mockaize.xml` e `<id>.OLD.mockaize.xml`. IDs físicos aceitam 1–128 caracteres ASCII alfanuméricos, `_` e `-`, recusando nomes reservados Windows; os IDs reais do Desktop continuam UUIDs. O ID dentro de current deve coincidir com o nome. OLD é somente backup; metadados e saves com configuração idêntica não o rotacionam.

Journal durável: `.sync/<operationId>.pending.json`, publicado por rename de `.pending.json.tmp`. Antes dele, snapshots são escritos no diretório de presets: `.<operationId>.<id>.current.before.tmp`, `.current.after.tmp`, `.old.before.tmp` e `.old.after.tmp`, conforme necessário. Todos são flush/fsync antes de publicar o journal. O protocolo usa publicação por arquivo e recuperação; não promete transação única filesystem/SQLite ou resistência universal a perda física de energia/servidor de rede.

Schema exato do journal:

```json
{
  "schemaVersion": 1,
  "operationId": "uuid canônico",
  "rootId": "uuid do manifesto do Desktop",
  "kind": "config-save|metadata|batch|backfill|import|restore",
  "catalogWide": false,
  "affectedIds": ["id em ordem, sem duplicatas"],
  "createdAt": "UTC ISO-8601",
  "files": [{
    "final": "id.mockaize.xml",
    "before": {"exists": true, "staged": ".op.id.current.before.tmp", "sha256": "hexadecimal"},
    "after": {"exists": true, "staged": ".op.id.current.after.tmp", "sha256": "hexadecimal"}
  }]
}
```

Snapshot ausente usa exatamente `{"exists":false}`. `staged` deve corresponder ao nome derivado de operação, ID, papel current/old e lado before/after; nenhum path arbitrário, separador, duplicata ou redirecionamento é aceito. O exemplo abrevia os UUIDs/hashes; os arquivos reais usam valores completos.

Tabela aditiva `preset_sync_commits(operation_id TEXT PRIMARY KEY, journal_sha256 TEXT NOT NULL, committed_at TEXT NOT NULL)` conserva `schema_version=2`. O hash é SHA-256 dos bytes exatos do journal. O marker é inserido na mesma transação da mutação de negócio. API nunca escreve nessa tabela.

Sob `storage.DB_LOCK`, o produtor recupera operações anteriores, abre uma transação, aplica a callback **somente no SQLite não commitado**, deriva snapshots, publica journal, insere marker e confirma o DB. Nenhuma callback pode confirmar por conta própria ou produzir efeito de filesystem externo. Só após o commit publica current/OLD, confere hashes, remove journal e responde sucesso. Marker e snapshots restantes são limpeza de resíduos seguros; falha nessa limpeza depois de remover o journal não transforma um salvamento concluído em pendência. O próximo recovery limpa somente nomes internos exatos e validados.

No startup e antes de cada mutação coordenada, journal sem marker restaura `before`; com marker/hash correspondente conclui `after`. Destino já com hash correto dispensa temp consumido por `os.replace`. Recovery valida todos os snapshots necessários antes de trocar o primeiro arquivo. Inacessibilidade do DB, journal inválido, hash divergente ou snapshot necessário perdido preservam o journal e geram `PresetSyncError`. O erro de gravação informa `operation_id`, `committed` (true/false; null se commit não puder ser confirmado) e `revisions` conhecidas quando commit confirmado. O frontend deve recuperar/recarregar, conservando rascunho, antes de reaplicar uma edição.

Consumidor read-only: qualquer journal publicado bloqueia listagem com indisponibilidade temporária. Consulta/geração por ID é bloqueada se `catalogWide=true` ou se o ID estiver em `affectedIds`; batches, ancestrais, backfill/import/restore usam `catalogWide=true`. Journal ou diretório de sincronização ilegível/inválido falha fechado. `.pending.json.tmp`, OLD e snapshots não são catálogo. Gerações que já carregaram snapshot podem continuar; a API não recupera, remove ou conclui journal. O helper `preset_store.pending(directory, variation_id=None)` materializa essa verificação sem escrever.

## Metadados produzidos pelo Desktop

O backend deriva `libraryPath` dos nomes dos ancestrais da variação, da raiz workspace até sua pasta pai, separados por `/`; `name` contém o nome da própria variação. É caminho de exibição, não caminho de filesystem. Nomes de pessoas/pastas não influenciam o nome físico estável por ID. Rename/move de um ancestral atualiza todas as variações afetadas. Revisões conservam o significado anterior do DB: rename de uma variação e publicação de artefato avançam revisão; mudar nome/posição de ancestral não inventa revisão de cada descendente.

`active` exige a variação e todos os seus ancestrais não excluídos. Excluir uma árvore conserva current como tombstone com `active=false`; OLD não é removido/rotacionado pela exclusão. Copiar uma árvore publica current para cada UUID novo, sem inventar OLD. Operações de biblioteca são um único journal catalogWide, incluindo comandos many.

`Context.timeZone` usa a preferência local `timeZone` quando definida ou `America/Fortaleza`, o fallback já usado pelo motor JavaScript. `save_settings` aceita UTC/GMT ou texto no formato IANA área/local com até 128 caracteres e exige que `ZoneInfo` reconheça o identificador antes de alterar dados. A dependência `tzdata>=2025.2`, também usada pela API, fornece dados IANA no Windows; build inclui os dados e as licenças dentro do executável. Alterar o setting atualiza contexto/hash de todos os presets, conservando configuração, revisão e OLD. O fuso continua separado do JSON normalizado da variação.

Salvar retorna o snapshot da própria transação, após publicação concluída. Uma revisão concorrente rejeitada não altera DB, current ou OLD. Publicar artefato continua produzindo seu XML em `Gerados`, depois coordena o avanço de contador/revisão e o preset; se esse commit já ocorreu ou não puder ser confirmado, uma falha de sincronização preserva o artefato referenciado para recuperação. Erro antes do commit confirmado remove somente o novo diretório de artefato desta tentativa, como no fluxo anterior.

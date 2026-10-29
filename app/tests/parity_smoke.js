(() => {
  const result = document.querySelector('#result');
  const inputXml = '<m:Request xmlns:m="urn:mockaize:parity" code="REQ"><m:Records>'
    + '<m:Record id="A"><m:Amount>1.25</m:Amount></m:Record>'
    + '<m:Record id="B"><m:Amount>2.75</m:Amount></m:Record>'
    + '</m:Records></m:Request>';
  const outputTemplate = label => '<m:Response xmlns:m="urn:mockaize:parity" kind="' + label + '"><m:Items>'
    + '<m:Item source=""><m:Sequence/><m:Literal/><m:Count/><m:Total/><m:Decimal/><m:Date/><m:Model/></m:Item>'
    + '</m:Items></m:Response>';
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const field = (doc, name, attribute = false) => {
    const match = MockXml.fields(doc).find(item => item.name === name && (attribute ? item.node.nodeType === 2 : item.node.nodeType === 1));
    if (!match) throw Error('Fixture sem campo ' + name + '.');
    return match.key;
  };
  const childValue = (record, name) => {
    const node = Array.from(record.children).find(child => child.localName === name);
    if (!node) throw Error('Saída sem campo ' + name + '.');
    return node.textContent;
  };
  try {
    assert(typeof MockXml !== 'undefined', 'Engine não carregou.');
    const source = MockXml.parse(inputXml);
    const baseGroup = MockXml.groups(source).find(item => item.name === 'Record');
    assert(baseGroup && baseGroup.count === 2, 'Fixture precisa conter dois registros de entrada.');
    const sourceId = field(source, 'id', true);
    const sourceAmount = field(source, 'Amount');
    const models = [
      { label: 'alpha', literal: 'café & <ok>', marker: 'Modelo A' },
      { label: 'beta', literal: 'ação & <ok>', marker: 'Modelo B' }
    ];
    for (const model of models) {
      const template = MockXml.parse(outputTemplate(model.label));
      const outGroup = MockXml.groups(template).find(item => item.name === 'Item');
      const paths = {
        sequence: field(template, 'Sequence'), literal: field(template, 'Literal'),
        count: field(template, 'Count'), total: field(template, 'Total'),
        decimal: field(template, 'Decimal'), date: field(template, 'Date'),
        model: field(template, 'Model'), copiedId: field(template, 'source', true)
      };
      const config = {
        mode: 'return', name: 'Smoke local', count: 2, inputGroup: baseGroup.key,
        outputTemplate: outputTemplate(model.label), outputGroup: outGroup.key,
        referenceDateTime: '2025-03-01T12:00:00.000Z', timeZone: 'America/Fortaleza',
        filename: { type: 'literal', value: 'parity-smoke-' + model.label }, presence: {},
        rules: {
          [paths.sequence]: { generator: { type: 'sequence', start: 3, step: 2, width: 3 } },
          [paths.literal]: { generator: { type: 'literal', value: model.literal } },
          [paths.count]: { generator: { type: 'count' } },
          [paths.total]: { generator: { type: 'groupSum', source: 'input', group: baseGroup.key, path: sourceAmount, allRecords: true } },
          [paths.decimal]: { generator: { type: 'compose', operation: 'sum', parts: [
            { type: 'literal', value: '1.25' }, { type: 'literal', value: '2.75' }
          ] } },
          [paths.date]: { generator: { type: 'date', mode: 'specific', value: '2025-03-08', format: 'yyyy-MM-dd' } },
          [paths.model]: { generator: { type: 'literal', value: model.marker } },
          [paths.copiedId]: { generator: { type: 'copy', path: sourceId } }
        }
      };
      const generated = MockXml.generate(config, inputXml);
      const output = MockXml.parse(generated.xml);
      const records = MockXml.records(output, generated.group);
      assert(records.length === 2, model.label + ': quantidade de registros inesperada.');
      const expected = [
        { sequence: '003', source: 'A' },
        { sequence: '005', source: 'B' }
      ];
      records.forEach((record, index) => {
        const want = expected[index];
        assert(record.getAttribute('source') === want.source, model.label + ': cópia do atributo divergiu no registro ' + index + '.');
        assert(childValue(record, 'Sequence') === want.sequence, model.label + ': sequência divergiu no registro ' + index + '.');
        assert(childValue(record, 'Literal') === model.literal, model.label + ': literal divergiu no registro ' + index + '.');
        assert(childValue(record, 'Count') === '2', model.label + ': contagem divergiu no registro ' + index + '.');
        assert(childValue(record, 'Total') === '4', model.label + ': groupSum decimal divergiu no registro ' + index + '.');
        assert(childValue(record, 'Decimal') === '4', model.label + ': compose decimal divergiu no registro ' + index + '.');
        assert(childValue(record, 'Date') === '2025-03-08', model.label + ': data específica divergiu no registro ' + index + '.');
        assert(childValue(record, 'Model') === model.marker, model.label + ': isolamento de modelo divergiu.');
      });
      assert((generated.xml.match(/<m:Item\b/g) || []).length === 2, model.label + ': saída textual não contém dois irmãos.');
      assert(/<\/m:Item>\n\s*<m:Item\b/.test(generated.xml), model.label + ': indentação/separação entre irmãos divergiu.');
      assert(generated.xml.includes('xmlns:m="urn:mockaize:parity"'), model.label + ': namespace foi perdido.');
      const escapedLiteral = model.literal.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      assert(generated.xml.includes(escapedLiteral), model.label + ': escaping XML inválido.');
    }
    result.dataset.state = 'pass';
    result.textContent = 'PASS — 2 modelos isolados; literal/escaping, cópia de atributo, count, sequence, groupSum decimal, compose decimal, data fixa, namespace e separação textual de irmãos.';
  } catch (error) {
    result.dataset.state = 'fail';
    result.textContent = 'FAIL — ' + (error?.stack || error);
  }
})();

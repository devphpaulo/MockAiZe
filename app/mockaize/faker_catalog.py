"""Controlled Faker catalogue used by MockAiZe formulas.

The browser never chooses a Python provider or method.  It submits a stable
catalogue id and this module resolves that id against the version bundled with
the application.  This keeps presets portable and prevents formula data from
becoming executable Python.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
import hashlib
import inspect
import json
import re
import secrets
from time import monotonic
import unicodedata
from typing import Any

from faker import Faker, VERSION as FAKER_VERSION


CATALOG_VERSION = 1
LOCALE = "pt_BR"
MAX_TEXT_LENGTH = 4096
MAX_BATCH_ITEMS = 25_000
BRAZIL_STATES = {
    "AC": ("Acre", "Rio Branco"), "AL": ("Alagoas", "Maceió"), "AP": ("Amapá", "Macapá"),
    "AM": ("Amazonas", "Manaus"), "BA": ("Bahia", "Salvador"), "CE": ("Ceará", "Fortaleza"),
    "DF": ("Distrito Federal", "Brasília"), "ES": ("Espírito Santo", "Vitória"),
    "GO": ("Goiás", "Goiânia"), "MA": ("Maranhão", "São Luís"), "MT": ("Mato Grosso", "Cuiabá"),
    "MS": ("Mato Grosso do Sul", "Campo Grande"), "MG": ("Minas Gerais", "Belo Horizonte"),
    "PA": ("Pará", "Belém"), "PB": ("Paraíba", "João Pessoa"), "PR": ("Paraná", "Curitiba"),
    "PE": ("Pernambuco", "Recife"), "PI": ("Piauí", "Teresina"), "RJ": ("Rio de Janeiro", "Rio de Janeiro"),
    "RN": ("Rio Grande do Norte", "Natal"), "RS": ("Rio Grande do Sul", "Porto Alegre"),
    "RO": ("Rondônia", "Porto Velho"), "RR": ("Roraima", "Boa Vista"), "SC": ("Santa Catarina", "Florianópolis"),
    "SP": ("São Paulo", "São Paulo"), "SE": ("Sergipe", "Aracaju"), "TO": ("Tocantins", "Palmas"),
}


@dataclass(frozen=True)
class CatalogItem:
    category: str
    category_label: str
    method: str
    label: str

    @property
    def id(self) -> str:
        return f"{self.category}.{self.method}"


# These are the public generation methods from the 16 approved providers in
# Faker 40.44.0.  CPF and CNPJ methods deliberately remain out of this list:
# MockAiZe already has dedicated generators and must not create a competing
# persisted contract for them.
_CATEGORIES: tuple[tuple[str, str, tuple[tuple[str, str], ...]], ...] = (
    ("person", "Pessoa fictícia", (
        ("name", "Nome completo"), ("first_name", "Primeiro nome"), ("last_name", "Sobrenome"),
        ("prefix", "Tratamento"), ("suffix", "Sufixo"), ("name_female", "Nome feminino"),
        ("name_male", "Nome masculino"), ("first_name_female", "Primeiro nome feminino"),
        ("first_name_male", "Primeiro nome masculino"), ("last_name_female", "Sobrenome feminino"),
        ("last_name_male", "Sobrenome masculino"), ("name_nonbinary", "Nome não binário"),
        ("first_name_nonbinary", "Primeiro nome não binário"), ("last_name_nonbinary", "Sobrenome não binário"),
        ("prefix_female", "Tratamento feminino"), ("prefix_male", "Tratamento masculino"),
        ("prefix_nonbinary", "Tratamento não binário"), ("suffix_female", "Sufixo feminino"),
        ("suffix_male", "Sufixo masculino"), ("suffix_nonbinary", "Sufixo não binário"),
        ("language_name", "Idioma"),
    )),
    ("company", "Empresa fictícia", (
        ("company", "Razão social"), ("trade_name", "Nome fantasia"), ("company_id", "CNPJ"),
        ("company_suffix", "Sufixo empresarial"), ("catch_phrase", "Frase de efeito"),
        ("catch_phrase_verb", "Verbo da frase de efeito"), ("catch_phrase_noun", "Substantivo da frase de efeito"),
        ("catch_phrase_attribute", "Atributo da frase de efeito"), ("bs", "Descrição de negócio"),
    )),
    ("address", "Endereço fictício", (
        ("address", "Endereço completo"), ("street_address", "Logradouro e número"),
        ("street_name", "Logradouro"), ("street_prefix", "Tipo de logradouro"), ("neighborhood", "Bairro"),
        ("street_suffix", "Complemento do logradouro"), ("building_number", "Número"),
        ("bairro", "Bairro"), ("city", "Cidade"), ("city_suffix", "Sufixo da cidade"),
        ("estado", "Estado"), ("estado_nome", "Nome do estado"), ("estado_sigla", "Sigla do estado"),
        ("state", "Estado"), ("state_abbr", "Sigla do estado"), ("administrative_unit", "Unidade administrativa"),
        ("postcode", "CEP"), ("country", "País"), ("country_code", "Código do país"),
        ("current_country", "País atual"), ("current_country_code", "Código do país atual"),
    )),
    ("phone_number", "Telefone fictício", (
        ("phone_number", "Telefone"), ("cellphone_number", "Celular"),
        ("service_phone_number", "Telefone de serviço"), ("msisdn", "Número MSISDN"),
        ("country_calling_code", "Código telefônico do país"),
    )),
    ("automotive", "Veículo fictício", (("license_plate", "Placa"), ("vin", "VIN"))),
    ("bank", "Dados bancários", (
        ("bank", "Banco"), ("bank_country", "País do banco"), ("bban", "BBAN"),
        ("iban", "IBAN"), ("swift8", "SWIFT de 8 caracteres"), ("swift11", "SWIFT de 11 caracteres"),
        ("swift", "Código SWIFT"), ("aba", "Código bancário ABA"),
    )),
    ("credit_card", "Cartão de crédito fictício", (
        ("credit_card_number", "Número do cartão"), ("credit_card_provider", "Bandeira do cartão"),
        ("credit_card_expire", "Validade do cartão"), ("credit_card_security_code", "Código de segurança"),
        ("credit_card_full", "Cartão completo"),
    )),
    ("currency", "Moeda", (
        ("currency", "Moeda"), ("currency_code", "Código da moeda"), ("currency_name", "Nome da moeda"),
        ("currency_symbol", "Símbolo da moeda"), ("pricetag", "Etiqueta de preço"),
        ("cryptocurrency", "Criptomoeda"), ("cryptocurrency_code", "Código da criptomoeda"),
        ("cryptocurrency_name", "Nome da criptomoeda"),
    )),
    ("color", "Cor", (
        ("color", "Cor"), ("color_name", "Nome da cor"), ("hex_color", "Cor hexadecimal"),
        ("rgb_color", "Cor RGB"), ("rgb_css_color", "Cor CSS RGB"), ("color_rgb", "Cor RGB em componentes"),
        ("color_rgb_float", "Cor RGB decimal"), ("color_hsl", "Cor HSL"), ("color_hsv", "Cor HSV"),
        ("safe_color_name", "Nome de cor segura"), ("safe_hex_color", "Cor segura hexadecimal"),
    )),
    ("barcode", "Código de barras", (
        ("ean", "EAN"), ("ean8", "EAN-8"), ("ean13", "EAN-13"), ("upc_a", "UPC-A"), ("upc_e", "UPC-E"),
        ("localized_ean", "EAN localizado"), ("localized_ean8", "EAN-8 localizado"),
        ("localized_ean13", "EAN-13 localizado"),
    )),
    ("internet", "Dados de internet", (
        ("email", "E-mail"), ("safe_email", "E-mail seguro"), ("free_email", "E-mail gratuito"),
        ("company_email", "E-mail corporativo"), ("ascii_email", "E-mail ASCII"),
        ("ascii_safe_email", "E-mail seguro ASCII"), ("ascii_free_email", "E-mail gratuito ASCII"),
        ("ascii_company_email", "E-mail corporativo ASCII"), ("user_name", "Nome de usuário"),
        ("domain_name", "Domínio"), ("domain_word", "Palavra do domínio"), ("free_email_domain", "Domínio gratuito"),
        ("safe_domain_name", "Domínio seguro"), ("hostname", "Nome de host"), ("url", "URL"),
        ("uri", "URI"), ("uri_page", "Página da URI"), ("uri_path", "Caminho da URI"),
        ("uri_extension", "Extensão da URI"), ("slug", "Slug"), ("tld", "Domínio de topo"),
        ("ipv4", "IPv4"), ("ipv4_private", "IPv4 privado"), ("ipv4_public", "IPv4 público"),
        ("ipv4_network_class", "Classe de rede IPv4"), ("ipv6", "IPv6"), ("mac_address", "Endereço MAC"),
        ("port_number", "Porta de rede"), ("http_method", "Método HTTP"), ("http_status_code", "Status HTTP"),
        ("image_url", "URL de imagem"), ("dga", "Domínio gerado por algoritmo"), ("iana_id", "ID IANA"),
        ("nic_handle", "Identificador NIC"), ("nic_handles", "Identificadores NIC"), ("ripe_id", "ID RIPE"),
    )),
    ("geo", "Coordenada geográfica", (
        ("latitude", "Latitude"), ("longitude", "Longitude"), ("coordinate", "Coordenada"),
        ("latlng", "Latitude e longitude"), ("local_latlng", "Coordenada local"),
        ("location_on_land", "Localização em terra"),
    )),
    ("job", "Profissão fictícia", (("job", "Profissão"), ("job_female", "Profissão feminina"), ("job_male", "Profissão masculina"))),
    ("lorem", "Texto fictício", (
        ("word", "Palavra"), ("words", "Palavras"), ("sentence", "Frase"), ("sentences", "Frases"),
        ("paragraph", "Parágrafo"), ("paragraphs", "Parágrafos"), ("text", "Texto"), ("texts", "Textos"),
    )),
    ("passport", "Passaporte fictício", (
        ("passport_number", "Número do passaporte"), ("passport_owner", "Titular do passaporte"),
        ("passport_gender", "Gênero do titular"), ("passport_dob", "Nascimento do titular"),
        ("passport_dates", "Datas do passaporte"), ("passport_full", "Passaporte completo"),
    )),
    ("ssn", "Identificador nacional fictício", (("ssn", "Identificador nacional"), ("rg", "Registro geral"), ("cin", "Carteira de identidade nacional"))),
)

ITEMS = tuple(CatalogItem(category, category_label, method, label)
              for category, category_label, methods in _CATEGORIES for method, label in methods)
ITEMS_BY_ID = {item.id: item for item in ITEMS}
PARAMETER_SPECS: dict[str, tuple[dict[str, Any], ...]] = {
    "lorem.words": ({"name": "nb", "label": "Quantidade de palavras", "type": "integer", "min": 1, "max": 100, "default": 3},),
    "lorem.sentences": ({"name": "nb", "label": "Quantidade de frases", "type": "integer", "min": 1, "max": 50, "default": 3},),
    "lorem.paragraphs": ({"name": "nb", "label": "Quantidade de parágrafos", "type": "integer", "min": 1, "max": 20, "default": 3},),
    "lorem.texts": ({"name": "nb_texts", "label": "Quantidade de textos", "type": "integer", "min": 1, "max": 20, "default": 3},),
    "lorem.text": ({"name": "max_nb_chars", "label": "Máximo de caracteres", "type": "integer", "min": 5, "max": MAX_TEXT_LENGTH, "default": 200},),
}
for _address_method in (item.method for item in ITEMS if item.category == "address"):
    PARAMETER_SPECS[f"address.{_address_method}"] = ({
        "name": "state", "label": "UF do perfil", "type": "select", "default": "any",
        "options": [["any", "Aleatória"], *[[uf, f"{uf} · {name}"] for uf, (name, _city) in BRAZIL_STATES.items()]],
    },)

for _id, _default in {"person.name": ["first_name", "last_name"], "address.address": ["street_name", "building_number", "bairro", "city", "state_abbr", "postcode"], "address.street_address": ["street_name", "building_number"]}.items():
    _options = [["first_name", "Primeiro nome"], ["last_name", "Sobrenome"]] if _id.startswith("person") else [["street_name", "Logradouro"], ["building_number", "Número"], ["bairro", "Bairro"], ["city", "Cidade"], ["state_abbr", "UF"], ["postcode", "CEP"], ["country", "País"]]
    PARAMETER_SPECS[_id] = (*PARAMETER_SPECS.get(_id, ()), {"name": "components", "label": "Componentes", "type": "multiselect", "options": _options, "default": _default})
PARAMETER_SPECS["company.company_id"] = (
    {"name": "mode", "label": "Tipo de CNPJ", "type": "select", "options": [["N", "Numérico"], ["A", "Alfanumérico"]], "default": "N"},
    {"name": "mask", "label": "Máscara", "type": "select", "options": [["no", "Sem máscara"], ["yes", "Com máscara"]], "default": "no"},
    {"name": "establishment", "label": "Estabelecimento", "type": "text", "default": "0001"},
)

# Public provider helpers are deliberately not selectable because they are
# either the application's own CPF/CNPJ contract or data-building helpers.
# Every other public Faker method from an approved provider is catalogued.
INTERNAL_EXCLUSIONS = {
    "company.cnpj": "CNPJ possui gerador próprio no MockAiZe.",
    "ssn.cpf": "CPF possui gerador próprio no MockAiZe.",
    "lorem.get_words_list": "Método auxiliar usado pelos métodos de texto; não é um gerador independente.",
}


def _generator() -> Faker:
    return Faker(LOCALE)


def _method_parameters(generator: Faker, method: str) -> list[dict[str, Any]]:
    """Expose method metadata without allowing arbitrary argument execution."""
    signature = inspect.signature(getattr(generator, "company" if method == "trade_name" else method))
    def default_value(value: Any) -> Any:
        if value is inspect.Parameter.empty:
            return None
        if isinstance(value, (datetime, date, time)):
            return value.isoformat()
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, (list, tuple)):
            return [default_value(item) for item in value]
        return repr(value)
    return [
        {"name": parameter.name, "required": parameter.default is inspect.Parameter.empty,
         "default": default_value(parameter.default),
         "annotation": str(parameter.annotation) if parameter.annotation is not inspect.Parameter.empty else ""}
        for parameter in signature.parameters.values()
        if parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    ]


# Visibility is independent of persisted IDs: removed options remain readable.
VISIBLE_METHODS = {
 "person": {"name", "first_name", "last_name"},
 "company": {"company", "trade_name", "company_id"},
 "phone_number": {"phone_number", "cellphone_number"},
 "bank": {"bank", "bank_country", "bban", "iban", "swift", "aba"},
 "currency": set(), "color": {"color_name"},
 "barcode": {"ean", "ean8", "ean13", "upc_a", "upc_e"},
 "internet": {"email", "company_email", "user_name", "domain_name", "ipv4", "ipv4_private", "ipv4_public", "ipv6", "mac_address", "image_url", "dga"},
 "geo": {"latitude", "longitude", "coordinate"}, "job": {"job"}, "lorem": {"sentence"},
 "passport": {"passport_number", "passport_owner", "passport_gender", "passport_dob", "passport_dates"},
}

def manifest() -> dict[str, Any]:
    generator = _generator()
    categories: list[dict[str, Any]] = []
    for category, label, _ in _CATEGORIES:
        items = [item for item in ITEMS if item.category == category and item.method in VISIBLE_METHODS.get(category, {i.method for i in ITEMS if i.category == category})]
        if not items:
            continue
        categories.append({
            "id": category,
            "label": label,
            "items": [{"id": item.id, "label": item.label, "method": item.method,
                       "providerParameters": _method_parameters(generator, item.method), "returnAnnotation": str(inspect.signature(getattr(generator, "company" if item.method == "trade_name" else item.method)).return_annotation), "parameters": list(PARAMETER_SPECS.get(item.id, ())) }
                      for item in items],
        })
    return {"catalogVersion": CATALOG_VERSION, "fakerVersion": FAKER_VERSION, "locale": LOCALE,
            "categories": categories, "legacyItems": [{"id": item.id, "category": item.category, "categoryLabel": item.category_label, "label": item.label, "parameters": list(PARAMETER_SPECS.get(item.id, ()))} for item in ITEMS if item.method not in VISIBLE_METHODS.get(item.category, {item.method})], "internalExclusions": INTERNAL_EXCLUSIONS}


def validate_formula(formula: object) -> CatalogItem:
    if not isinstance(formula, dict) or set(formula) - {"type", "catalogVersion", "category", "catalogId", "params", "group"}:
        raise ValueError("Fórmula Faker inválida.")
    if formula.get("type") != "faker" or (type(formula.get("catalogVersion")) is not int or formula["catalogVersion"] != CATALOG_VERSION):
        raise ValueError("Tipo ou versão do catálogo Faker inválido.")
    catalog_id = formula.get("catalogId")
    if not isinstance(catalog_id, str):
        raise ValueError("Dado Faker não reconhecido.")
    item = ITEMS_BY_ID.get(catalog_id)
    if item is None:
        raise ValueError("Dado Faker não reconhecido.")
    if formula.get("category", item.category) != item.category:
        raise ValueError("A categoria não corresponde ao dado Faker selecionado.")
    params = formula.get("params", {})
    specs = {parameter["name"]: parameter for parameter in PARAMETER_SPECS.get(item.id, ())}
    if not isinstance(params, dict) or set(params) - set(specs):
        raise ValueError("parâmetros não reconhecidos para este dado Faker.")
    for name, value in params.items():
        spec = specs[name]
        if spec["type"] == "integer" and (isinstance(value, bool) or not isinstance(value, int) or not spec["min"] <= value <= spec["max"]):
            raise ValueError(f"Parâmetro {name} deve ser um inteiro entre {spec['min']} e {spec['max']}.")
        if spec["type"] == "select" and (not isinstance(value, str) or value not in {option[0] for option in spec["options"]}):
            raise ValueError(f"Parâmetro {name} possui uma opção inválida.")
        if spec["type"] == "multiselect" and (not isinstance(value, list) or not value or any(not isinstance(v, str) or v not in {o[0] for o in spec["options"]} for v in value) or len(set(value)) != len(value)):
            raise ValueError("Selecione componentes válidos sem repetição.")
        if spec["type"] == "text" and (not isinstance(value, str) or not re.fullmatch(r"[A-Z0-9]{4}", value) or value == "0000" or params.get("mode", "N") == "N" and not value.isdigit()):
            raise ValueError("Estabelecimento: informe quatro caracteres válidos, diferentes de 0000.")
    group = formula.get("group", "")
    if not isinstance(group, str) or len(group) > 128:
        raise ValueError("Grupo Faker inválido.")
    return item


def to_text(value: Any) -> str:
    """Convert one Faker result into exactly one bounded textual XML value."""
    if isinstance(value, bytes):
        result = value.decode("utf-8", errors="replace")
    elif isinstance(value, (datetime, date, time)):
        result = value.isoformat()
    elif isinstance(value, set):
        result = " | ".join(to_text(item) for item in sorted(value, key=lambda item: str(item)))
    elif isinstance(value, (list, tuple)):
        result = " | ".join(to_text(item) for item in value)
    elif isinstance(value, dict):
        result = json.dumps({str(key): to_text(item) for key, item in value.items()}, ensure_ascii=False,
                            sort_keys=True, separators=(",", ":"))
    elif isinstance(value, (str, int, float, bool, Decimal)) or value is None:
        result = str(value)
    else:
        raise ValueError(f"Resultado Faker do tipo {type(value).__name__} não possui conversão textual definida.")
    if len(result) > MAX_TEXT_LENGTH:
        raise ValueError(f"Resultado Faker excede o limite de {MAX_TEXT_LENGTH} caracteres.")
    return result


def generate(formula: object) -> dict[str, Any]:
    item = validate_formula(formula)
    generator = _generator()
    profile_key = (0, _profile_family(item), formula.get("group", ""), formula.get("params", {}).get("state", "any"))
    value = _resolved_value(generator, item, profile_key, {}, formula.get("params", {}))
    return {"catalogVersion": CATALOG_VERSION, "catalogId": item.id, "value": to_text(value)}


def generate_batch(payload: object) -> dict[str, Any]:
    """Resolve a bounded, all-or-nothing set of allowlisted formula requests."""
    if not isinstance(payload, dict) or (set(payload) - {"items", "seed"} or "items" not in payload) or not isinstance(payload["items"], list):
        raise ValueError("Lote Faker inválido.")
    items = payload["items"]
    if not 1 <= len(items) <= MAX_BATCH_ITEMS:
        raise ValueError(f"O lote Faker aceita de 1 a {MAX_BATCH_ITEMS} itens.")
    seed = payload.get("seed", secrets.token_hex(16))
    if not isinstance(seed, str) or not 1 <= len(seed) <= 128:
        raise ValueError("Semente do lote Faker inválida.")
    generator = _generator()
    profile_values: dict[tuple[int, str, str, str], dict[str, str]] = {}
    resolved: dict[str, str] = {}
    deadline = monotonic() + 15
    total_length = 0
    for request in items:
        if monotonic() > deadline:
            raise ValueError("O lote Faker excedeu 15 segundos. Reduza o lote.")
        if not isinstance(request, dict) or set(request) != {"key", "formula"}:
            raise ValueError("Item do lote Faker inválido.")
        key = request["key"]
        if not isinstance(key, str) or not 1 <= len(key) <= 512 or key in resolved:
            raise ValueError("Chave do lote Faker inválida ou duplicada.")
        item = validate_formula(request["formula"])
        formula = request["formula"]
        try:
            key_parts = json.loads(key)
            record_index = key_parts[1] if isinstance(key_parts, list) and len(key_parts) == 2 else 0
        except (TypeError, ValueError, json.JSONDecodeError):
            record_index = 0
        if type(record_index) is not int or not 0 <= record_index < 10_000:
            raise ValueError("Índice de registro Faker inválido.")
        family = _profile_family(item)
        profile_key = (record_index, family, formula.get("group", ""), formula.get("params", {}).get("state", "any"))
        # A stable operation seed preserves profiles across HTTP chunks, regardless
        # of the order in which their attributes are requested.
        identity = profile_key if family in {"person", "company", "address"} else (profile_key, item.id, formula.get("params", {}))
        digest = hashlib.sha256(json.dumps([seed, identity], sort_keys=True).encode()).digest()
        generator.seed_instance(int.from_bytes(digest, "big"))
        resolved[key] = to_text(_resolved_value(generator, item, profile_key, profile_values, formula.get("params", {})))
        total_length += len(resolved[key])
        if total_length > 16_000_000:
            raise ValueError("O resultado do lote Faker excede 16 milhões de caracteres. Reduza o lote.")
    return {"catalogVersion": CATALOG_VERSION, "values": resolved}


def _profile_family(item: CatalogItem) -> str:
    if item.category == "internet" and item.method in {"email", "safe_email", "free_email", "ascii_email", "ascii_safe_email", "ascii_free_email", "user_name"}:
        return "person"
    if item.category == "internet" and item.method in {"company_email", "ascii_company_email"}:
        return "company"
    return item.category


def _resolved_value(generator, item, key, profiles, params):
    if item.id == "company.company_id":
        from faker.providers.company.pt_BR import company_id_checksum
        base = generator.company_id(use_alphanumeric=params.get("mode") == "A")[:8] + params.get("establishment", "0001")
        value = base + "".join(str(d) for d in company_id_checksum([ord(c) - 48 for c in base]))
        return f"{value[:2]}.{value[2:5]}.{value[5:8]}/{value[8:12]}-{value[12:]}" if params.get("mask") == "yes" else value
    value = _profile_value(generator, item, key, profiles, {k: v for k, v in params.items() if k != "components"})
    if "components" in params:
        separator = " " if item.category == "person" else ", "
        return separator.join(profiles[key][component] for component in params["components"])
    return value


def _profile_value(generator: Faker, item: CatalogItem, key: tuple[int, str, str, str],
                   profiles: dict[tuple[int, str, str, str], dict[str, str]], params: dict[str, Any]) -> Any:
    if key[1] == "person" and item.category in {"person", "internet"}:
        values = profiles.get(key)
        if values is None:
            first_name, last_name = generator.first_name(), generator.last_name()
            name = f"{first_name} {last_name}"
            username = re.sub(r"[^a-z0-9]+", ".", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip(".")
            values = {"name": name, "first_name": first_name, "last_name": last_name,
                      "email": username + "@example.test", "user_name": username}
            profiles[key] = values
        if item.category == "person" and item.method in {"name", "first_name", "last_name"}:
            return profiles[key][item.method]
        if item.category == "internet" and item.method in {"email", "safe_email", "free_email", "ascii_email", "ascii_safe_email", "ascii_free_email", "user_name"}:
            return profiles[key]["user_name"] if item.method == "user_name" else profiles[key]["email"]
    if key[1] == "company" and item.category in {"company", "internet"}:
        values = profiles.get(key)
        if values is None:
            name = generator.company()
            slug = re.sub(r"[^a-z0-9]+", ".", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip(".")
            profiles[key] = {"company": name, "company_email": "contato@" + (slug or "empresa") + ".example.test"}
        if item.category == "company" and item.method in {"company", "trade_name"}:
            name = profiles[key]["company"]
            return re.sub(r"\s+(?:LTDA\.?|S/A|S\.A\.)$", "", name, flags=re.I) if item.method == "trade_name" else name
        if item.category == "internet" and item.method in {"company_email", "ascii_company_email"}:
            return profiles[key]["company_email"]
    if key[1] == "address" and item.category == "address":
        values = profiles.get(key)
        if values is None:
            selected = params.get("state", "any")
            state = selected if selected != "any" else generator.random_element(tuple(BRAZIL_STATES))
            state_name, city = BRAZIL_STATES[state]
            street_name = generator.street_name()
            number = generator.building_number()
            street = f"{street_name}, {number}"
            district = generator.bairro()
            postcode = generator.postcode()
            values = {"address": f"{street} - {district}, {city}/{state} - {postcode}",
                      "street_address": street, "street_name": street_name,
                      "building_number": number, "bairro": district, "neighborhood": district,
                      "city": city, "estado": state_name, "estado_nome": state_name,
                      "estado_sigla": state, "state": state_name, "state_abbr": state,
                      "postcode": postcode, "street_prefix": generator.street_prefix(),
                      "street_suffix": generator.street_suffix(), "country": generator.current_country(),
                      "country_code": generator.current_country_code(), "current_country": generator.current_country(),
                      "current_country_code": generator.current_country_code(), "city_suffix": generator.city_suffix(),
                      "administrative_unit": state_name}
            profiles[key] = values
        if item.method in profiles[key]:
            return profiles[key][item.method]
    return getattr(generator, item.method)(**params)

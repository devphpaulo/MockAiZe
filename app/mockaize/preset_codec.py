"""C-PRESET-1: typed, self-contained XML snapshots (no filesystem writes)."""
import hashlib
import hmac
import json
import math
import re
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .storage import GENERATOR_TYPES, normalize_config, validate_formula

NAMESPACE = "urn:mockaize:preset:1"
ET.register_namespace("", NAMESPACE)
ROOT_ATTRIBUTES = {"schemaVersion": "1", "engineSpecVersion": "1", "format": "xml"}


class PresetError(ValueError):
    """Invalid or unsupported preset; callers must not hide it with fallback."""


def _tag(name):
    return f"{{{NAMESPACE}}}{name}"


def _formula_position(path):
    if path and path[-1] == "filename":
        return (path[:-1] in (("filter",), ("manual",)) or
                len(path) == 4 and path[0] == "filterPresets" and isinstance(path[1], int) and path[2] == "filter" or
                len(path) == 3 and path[0] == "returnModels" and isinstance(path[1], int))
    if len(path) == 2 and path[0] == "filenameByMode":
        return path[1] in ("new", "return")
    if len(path) == 3 and path[:2] == ("manual", "formulas"):
        return True
    if len(path) == 4 and path[0] == "rulesByMode" and path[1] in ("new", "return") and path[-1] == "generator":
        return True
    if len(path) == 5 and path[0] == "returnModels" and isinstance(path[1], int) and path[2] == "rules" and path[-1] == "generator":
        return True
    return False


def _json_value(value):
    if type(value) is str:
        if any(not (c in '\t\n\r' or '\x20' <= c <= '\ud7ff' or '\ue000' <= c <= '\ufffd' or '\U00010000' <= c <= '\U0010ffff') for c in value):
            raise PresetError("Preset text contains characters forbidden by XML 1.0.")
        return
    if value is None or type(value) in (bool, int):
        return
    if type(value) is float and math.isfinite(value):
        return
    if type(value) is list:
        for item in value:
            _json_value(item)
        return
    if type(value) is dict and all(type(key) is str for key in value):
        for key, item in value.items():
            _json_value(key)
            _json_value(item)
        return
    raise PresetError("Preset values must be finite JSON values.")


def canonical_payload(metadata, configuration, context):
    payload = {"metadata": metadata, "configuration": configuration, "context": context}
    _json_value(payload)
    try:
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (ValueError, UnicodeError) as exc:
        raise PresetError("Invalid JSON text in preset.") from exc


def payload_hash(metadata, configuration, context):
    return hashlib.sha256(canonical_payload(metadata, configuration, context)).hexdigest()


def _validate(metadata, configuration, context):
    _json_value({"metadata": metadata, "configuration": configuration, "context": context})
    if type(metadata) is not dict or set(metadata) != {"id", "name", "libraryPath", "revision", "fileIndex", "active"}:
        raise PresetError("Invalid preset metadata fields.")
    if any(type(metadata[key]) is not str for key in ("id", "name", "libraryPath")) or not metadata["id"]:
        raise PresetError("Invalid preset metadata text.")
    if (not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", metadata["id"])
            or re.fullmatch(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", metadata["id"], re.I)):
        raise PresetError("Invalid preset ID.")
    if any(type(metadata[key]) is not int or metadata[key] < (1 if key == "revision" else 0) for key in ("revision", "fileIndex")) or type(metadata["active"]) is not bool:
        raise PresetError("Invalid preset metadata types.")
    if type(context) is not dict or set(context) != {"timeZone"} or type(context["timeZone"]) is not str or not context["timeZone"]:
        raise PresetError("Invalid preset context.")
    try:
        ZoneInfo(context["timeZone"])
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise PresetError("Invalid preset time zone.") from exc
    try:
        if normalize_config(json.loads(json.dumps(configuration))) != configuration:
            raise PresetError("Preset configuration must already be normalized.")
    except (ValueError, TypeError, KeyError) as exc:
        raise PresetError(f"Invalid preset configuration: {exc}") from exc


def _encode(value, path=(), configuration=False, formula=False):
    element = ET.Element(_tag("Value"))
    is_formula = formula or configuration and _formula_position(path) and isinstance(value, dict) and bool(value)
    if is_formula:
        validate_formula(value)
        element.set("kind", "formula")
        body = ET.SubElement(element, _tag(value["type"]))
        for key in sorted(set(value) - {"type"}):
            prop = ET.SubElement(body, _tag("Property"), {"name": key})
            child = value[key]
            if value["type"] == "compose" and key == "parts":
                array = ET.SubElement(prop, _tag("Value"), {"kind": "array"})
                for part in child:
                    ET.SubElement(array, _tag("Item")).append(_encode(part, formula=True))
            else:
                prop.append(_encode(child))
    elif type(value) is dict:
        element.set("kind", "object")
        for key in sorted(value):
            ET.SubElement(element, _tag("Property"), {"name": key}).append(_encode(value[key], path + (key,), configuration))
    elif type(value) is list:
        element.set("kind", "array")
        for index, item in enumerate(value):
            ET.SubElement(element, _tag("Item")).append(_encode(item, path + (index,), configuration))
    elif type(value) is str:
        element.set("kind", "string")
        element.text = value
    elif type(value) is bool:
        element.set("kind", "boolean")
        element.text = "true" if value else "false"
    elif value is None:
        element.set("kind", "null")
    else:
        element.set("kind", "number")
        element.text = json.dumps(value, allow_nan=False)
    return element


def encode_preset(metadata, configuration, context):
    """Return UTF-8 bytes for an already normalized configuration snapshot."""
    _validate(metadata, configuration, context)
    root = ET.Element(_tag("MockAiZePreset"), ROOT_ATTRIBUTES)
    for name, value in (("Metadata", metadata), ("Configuration", configuration), ("Context", context)):
        ET.SubElement(root, _tag(name)).append(_encode(value, configuration=name == "Configuration"))
    ET.SubElement(root, _tag("PayloadHash"), {"algorithm": "sha256"}).text = payload_hash(metadata, configuration, context)
    ET.indent(root, space="  ")
    # XML normalizes literal CR on input; references preserve the original text.
    return ET.tostring(root, encoding="utf-8", xml_declaration=True).replace(b"\r", b"&#13;") + b"\n"


def _structure(element, name, attrs, children=None, text=False):
    if element.tag != _tag(name) or element.attrib != attrs:
        raise PresetError(f"Invalid {name} element or attributes.")
    if not text and (element.text or "").strip():
        raise PresetError(f"Unexpected text in {name}.")
    if children is not None and len(element) != children:
        raise PresetError(f"Invalid child count in {name}.")
    if any((child.tail or "").strip() for child in element):
        raise PresetError(f"Unexpected tail text in {name}.")


def _decode(element, path=(), configuration=False, formula=False):
    kind = element.get("kind")
    _structure(element, "Value", {"kind": kind}, text=kind in ("string", "boolean", "number"))
    semantic_formula = formula or configuration and _formula_position(path)
    if kind == "formula":
        if not semantic_formula or len(element) != 1:
            raise PresetError("Formula outside a semantic formula position.")
        body = element[0]
        name = body.tag.removeprefix(f"{{{NAMESPACE}}}") if isinstance(body.tag, str) else ""
        if name not in GENERATOR_TYPES:
            raise PresetError("Unknown formula type.")
        _structure(body, name, {})
        result = {"type": name}
        for prop in body:
            key = prop.get("name")
            _structure(prop, "Property", {"name": key}, 1)
            if key is None or key in result:
                raise PresetError("Duplicate or unnamed formula property.")
            if name == "compose" and key == "parts":
                array = prop[0]
                _structure(array, "Value", {"kind": "array"})
                result[key] = []
                for item in array:
                    _structure(item, "Item", {}, 1)
                    result[key].append(_decode(item[0], formula=True))
            else:
                result[key] = _decode(prop[0])
        try:
            validate_formula(result)
        except ValueError as exc:
            raise PresetError(f"Invalid formula: {exc}") from exc
        return result
    if kind == "object":
        result = {}
        for prop in element:
            key = prop.get("name")
            _structure(prop, "Property", {"name": key}, 1)
            if key is None or key in result:
                raise PresetError("Duplicate or unnamed object property.")
            result[key] = _decode(prop[0], path + (key,), configuration)
        if semantic_formula and result:
            raise PresetError("Formula must use kind=formula.")
        return result
    if kind == "array":
        result = []
        for index, item in enumerate(element):
            _structure(item, "Item", {}, 1)
            result.append(_decode(item[0], path + (index,), configuration))
        return result
    if len(element):
        raise PresetError("Scalar Value cannot contain elements.")
    value = element.text or ""
    if kind == "string":
        return value
    if kind == "null" and value == "":
        return None
    if kind == "boolean" and value in ("true", "false"):
        return value == "true"
    if kind == "number" and re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", value):
        result = json.loads(value)
        if type(result) is int or math.isfinite(result):
            return result
    raise PresetError("Unknown kind or invalid scalar value.")


def decode_preset(xml):
    """Validate a preset and return metadata/configuration/context dictionaries."""
    try:
        text = xml.decode("utf-8-sig") if isinstance(xml, bytes) else xml
        if not isinstance(text, str) or re.search(r"<!\s*(?:DOCTYPE|ENTITY)", text, re.I) or "\x00" in text:
            raise PresetError("DOCTYPE, entities and non-UTF-8 presets are forbidden.")
        declaration = re.match(r"\s*<\?xml\s+[^?]*encoding=['\"]([^'\"]+)", text, re.I)
        if declaration and declaration[1].lower() not in ("utf-8", "utf8"):
            raise PresetError("Preset encoding must be UTF-8.")
        root = ET.fromstring(text, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True)))
        _structure(root, "MockAiZePreset", ROOT_ATTRIBUTES, 4)
        payload = {}
        for name, child in zip(("Metadata", "Configuration", "Context"), root[:3]):
            _structure(child, name, {}, 1)
            payload[name.lower()] = _decode(child[0], configuration=name == "Configuration")
        _structure(root[3], "PayloadHash", {"algorithm": "sha256"}, 0, text=True)
        digest = root[3].text or ""
        _validate(payload["metadata"], payload["configuration"], payload["context"])
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or not hmac.compare_digest(digest, payload_hash(**payload)):
            raise PresetError("Preset payload hash mismatch.")
        return payload
    except PresetError:
        raise
    except (ET.ParseError, UnicodeError, ValueError, TypeError, RecursionError, AttributeError) as exc:
        raise PresetError("Invalid preset XML.") from exc

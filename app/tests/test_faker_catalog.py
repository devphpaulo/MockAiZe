from __future__ import annotations

import json
import re
import unicodedata
import unittest
import threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from faker import Faker
from faker.providers import BaseProvider
from mockaize import faker_catalog, powershell_export, server, storage


class FakerCatalogCase(unittest.TestCase):
    def test_requested_catalog_visibility_preserves_removed_ids(self):
        manifest = faker_catalog.manifest()
        categories = {c['id']: {i['method'] for i in c['items']} for c in manifest['categories']}
        self.assertEqual(categories['person'], {'name', 'first_name', 'last_name'})
        self.assertEqual(categories['company'], {'company', 'trade_name', 'company_id'})
        self.assertNotIn('currency', categories)
        self.assertEqual(categories['color'], {'color_name'})
        self.assertEqual(categories['lorem'], {'sentence'})
        self.assertIn('currency.currency', {i['id'] for i in manifest['legacyItems']})
        faker_catalog.generate({'type':'faker','catalogVersion':1,'catalogId':'currency.currency'})

    def test_checkbox_components_share_the_profile(self):
        f={'type':'faker','catalogVersion':1,'catalogId':'person.name','params':{'components':['last_name']}}
        self.assertTrue(faker_catalog.generate(f)['value'])
        with self.assertRaises(ValueError):
            faker_catalog.generate({**f,'params':{'components':[]}})
        address={**f,'catalogId':'address.address','params':{'state':'CE','components':['city','state_abbr']}}
        self.assertEqual(faker_catalog.generate(address)['value'], 'Fortaleza, CE')

    def test_company_cnpj_modes_and_establishment(self):
        for mode in ('N','A'):
            f={'type':'faker','catalogVersion':1,'catalogId':'company.company_id','params':{'mode':mode,'mask':'yes','establishment':'0002'}}
            value=faker_catalog.generate(f)['value']
            self.assertRegex(value, r'^[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}/0002-\d{2}$')
    def test_real_http_batch_enforces_authentication_and_returns_controlled_errors(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        httpd.session_token = "test-session"
        httpd.csrf_token = "test-csrf"
        worker = threading.Thread(target=httpd.serve_forever, daemon=True)
        worker.start()
        origin = f"http://127.0.0.1:{httpd.server_port}"
        headers = {"Content-Type": "application/json", "Origin": origin,
                   "Cookie": "mockaize_session=test-session", "X-CSRF-Token": "test-csrf"}
        formula = {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}
        payload = {"items": [{"key": "name", "formula": formula}], "seed": "operation"}
        try:
            request = Request(origin + "/api/faker/batch", json.dumps(payload).encode(), headers)
            with urlopen(request, timeout=5) as response:
                self.assertTrue(json.load(response)["values"]["name"])
                self.assertIn("no-store", response.headers["Cache-Control"])
            formula["catalogId"] = []
            request = Request(origin + "/api/faker/batch", json.dumps(payload).encode(), headers)
            with self.assertRaises(HTTPError) as error:
                urlopen(request, timeout=5)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
            request = Request(origin + "/api/faker/batch", b"{}", {"Content-Type": "application/json"})
            with self.assertRaises(HTTPError) as error:
                urlopen(request, timeout=5)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        finally:
            httpd.shutdown()
            httpd.server_close()
            worker.join(timeout=3)
    def test_profiles_remain_identical_across_request_chunks(self):
        formulas = [{"type": "faker", "catalogVersion": 1, "catalogId": item, "group": "customer"}
                    for item in ("person.name", "person.first_name", "person.last_name", "internet.email")]
        items = [{"key": json.dumps([formula, 0]), "formula": formula} for formula in formulas]
        seed = "d725ba5e-3f17-4842-bf10-8617788853eb"
        complete = faker_catalog.generate_batch({"items": items, "seed": seed})["values"]
        separate = {}
        for item in items:
            separate.update(faker_catalog.generate_batch({"items": [item], "seed": seed})["values"])
        self.assertEqual(complete, separate)

    def test_malformed_formula_types_are_reported_as_validation_errors(self):
        formula = {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}
        for change in ({"catalogId": []}, {"catalogVersion": True}, {"catalogId": "address.city", "params": {"state": []}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                faker_catalog.validate_formula({**formula, **change})

    def test_address_components_share_street_number_and_state(self):
        methods = ("street_address", "street_name", "building_number", "address", "city", "state_abbr")
        formulas = [{"type": "faker", "catalogVersion": 1, "catalogId": "address." + method,
                     "params": {"state": "CE"}} for method in methods]
        items = [{"key": json.dumps([formula, 0]), "formula": formula} for formula in formulas]
        values = list(faker_catalog.generate_batch({"items": items})["values"].values())
        self.assertEqual(values[0], f"{values[1]}, {values[2]}")
        self.assertIn(values[0], values[3])
        self.assertEqual(values[4:], ["Fortaleza", "CE"])

    def test_generation_capacity_and_reuses_one_faker_instance(self):
        formula = {"type": "faker", "catalogVersion": 1, "catalogId": "phone_number.phone_number"}
        with patch.object(faker_catalog, "_generator", wraps=faker_catalog._generator) as factory:
            values = faker_catalog.generate_batch({"items": [
                {"key": json.dumps([formula, index]), "formula": formula} for index in range(10_000)
            ]})["values"]
        self.assertEqual(len(values), 10_000)
        self.assertEqual(factory.call_count, 1)
        self.assertEqual(storage.normalize_config({"recordCount": 10_000})["recordCount"], 10_000)
        with self.assertRaises(ValueError):
            storage.normalize_config({"recordCount": 10_001})

    def test_batch_deadline_is_enforced_without_returning_partial_values(self):
        formula = {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}
        with patch.object(faker_catalog, "monotonic", side_effect=[0, 16]):
            with self.assertRaisesRegex(ValueError, "15 segundos"):
                faker_catalog.generate_batch({"items": [{"key": "name", "formula": formula}]})

    def test_manual_profile_seed_survives_normalization(self):
        config = storage.normalize_config({})
        config["manual"]["fakerSeed"] = "record-profile-seed"
        normalized = storage.normalize_config(config)
        self.assertEqual(normalized["manual"]["fakerSeed"], "record-profile-seed")

    def test_manifest_contains_the_16_approved_categories(self):
        manifest = faker_catalog.manifest()
        self.assertEqual(manifest["catalogVersion"], 1)
        self.assertEqual(manifest["fakerVersion"], "40.44.0")
        self.assertEqual(len(manifest["categories"]), 15)
        self.assertEqual({category["id"] for category in manifest["categories"]}, {
            "person", "company", "address", "phone_number", "automotive", "bank", "credit_card",
            "color", "barcode", "internet", "geo", "job", "lorem", "passport", "ssn",
        })

    def test_every_catalogue_item_can_generate_one_text_value(self):
        for item in faker_catalog.ITEMS:
            with self.subTest(item=item.id):
                result = faker_catalog.generate({"type": "faker", "catalogVersion": 1, "catalogId": item.id})
                self.assertEqual(result["catalogId"], item.id)
                self.assertIsInstance(result["value"], str)
                self.assertLessEqual(len(result["value"]), faker_catalog.MAX_TEXT_LENGTH)

    def test_text_conversion_is_stable_for_supported_result_types(self):
        self.assertEqual(faker_catalog.to_text(Decimal("12.50")), "12.50")
        self.assertEqual(faker_catalog.to_text(datetime(2026, 10, 29, tzinfo=timezone.utc)), "2026-10-29T00:00:00+00:00")
        self.assertEqual(faker_catalog.to_text(["PE", "Recife"]), "PE | Recife")
        self.assertEqual(faker_catalog.to_text({"uf": "PE", "cidade": "Recife"}), '{"cidade":"Recife","uf":"PE"}')
        self.assertEqual(faker_catalog.to_text({"PE", "AC"}), "AC | PE")
        with self.assertRaisesRegex(ValueError, "conversão textual definida"):
            faker_catalog.to_text(object())

    def test_approved_provider_methods_are_catalogued_or_explained(self):
        fake = Faker(faker_catalog.LOCALE)
        for category in {item.category for item in faker_catalog.ITEMS}:
            provider = next(provider for provider in fake.get_providers()
                            if type(provider).__module__.startswith(f"faker.providers.{category}."))
            methods = set()
            for provider_class in type(provider).__mro__:
                if provider_class is BaseProvider:
                    break
                if provider_class.__module__.startswith("faker.providers."):
                    methods.update(name for name, value in provider_class.__dict__.items()
                                   if not name.startswith("_") and callable(value))
            catalogued = {item.method for item in faker_catalog.ITEMS if item.category == category and item.method != "trade_name"}
            excluded = {method.split(".", 1)[1] for method in faker_catalog.INTERNAL_EXCLUSIONS
                        if method.startswith(category + ".")}
            self.assertEqual(methods, catalogued | excluded)

    def test_formula_validation_rejects_unknown_ids_and_parameters(self):
        valid = {"type": "faker", "catalogVersion": 1, "catalogId": "person.name", "group": "cliente"}
        storage.validate_formula(valid)
        with self.assertRaisesRegex(ValueError, "não reconhecido"):
            storage.validate_formula({**valid, "catalogId": "person.execute"})
        with self.assertRaisesRegex(ValueError, "parâmetros"):
            storage.validate_formula({**valid, "params": {"method": "__import__"}})

    def test_batch_is_all_or_nothing_and_bounded(self):
        result = faker_catalog.generate_batch({"items": [
            {"key": "record-0:name", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}},
            {"key": "record-0:phone", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "phone_number.phone_number"}},
        ]})
        self.assertEqual(set(result["values"]), {"record-0:name", "record-0:phone"})
        with self.assertRaisesRegex(ValueError, "duplicada"):
            faker_catalog.generate_batch({"items": [{"key": "x", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}}, {"key": "x", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}}]})
        with self.assertRaisesRegex(ValueError, "não reconhecido"):
            faker_catalog.generate_batch({"items": [
                {"key": "good", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}},
                {"key": "bad", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.not_a_method"}},
            ]})
        too_many = {"key": "unused", "formula": {"type": "faker", "catalogVersion": 1, "catalogId": "person.name"}}
        with self.assertRaisesRegex(ValueError, "25000"):
            faker_catalog.generate_batch({"items": [too_many] * (faker_catalog.MAX_BATCH_ITEMS + 1)})

    def test_batches_cover_1_100_and_500_records(self):
        for count in (1, 100, 500):
            formula = {"type": "faker", "catalogVersion": 1, "catalogId": "phone_number.phone_number", "group": "contact"}
            items = [{"key": json.dumps([formula, index], separators=(",", ":")), "formula": formula}
                     for index in range(count)]
            with self.subTest(records=count):
                response = faker_catalog.generate_batch({"items": items})
                self.assertEqual(len(response["values"]), count)
                self.assertTrue(all(isinstance(value, str) and value for value in response["values"].values()))

    def test_batch_reuses_person_and_company_profile_values(self):
        person = {"type": "faker", "catalogVersion": 1, "catalogId": "person.name", "group": "customer"}
        email = {"type": "faker", "catalogVersion": 1, "catalogId": "internet.email", "group": "customer"}
        company = {"type": "faker", "catalogVersion": 1, "catalogId": "company.company", "group": "vendor"}
        company_email = {"type": "faker", "catalogVersion": 1, "catalogId": "internet.company_email", "group": "vendor"}
        result = faker_catalog.generate_batch({"items": [
            {"key": json.dumps([person, 0], separators=(",", ":")), "formula": person},
            {"key": json.dumps([email, 0], separators=(",", ":")), "formula": email},
            {"key": json.dumps([company, 0], separators=(",", ":")), "formula": company},
            {"key": json.dumps([company_email, 0], separators=(",", ":")), "formula": company_email},
        ]})
        person_name = result["values"][json.dumps([person, 0], separators=(",", ":"))]
        email_value = result["values"][json.dumps([email, 0], separators=(",", ":"))]
        company_name = result["values"][json.dumps([company, 0], separators=(",", ":"))]
        company_email_value = result["values"][json.dumps([company_email, 0], separators=(",", ":"))]
        first_name = unicodedata.normalize("NFKD", person_name.split()[0]).encode("ascii", "ignore").decode().lower()
        self.assertIn(first_name, email_value)
        self.assertIn("@example.test", email_value)
        self.assertTrue(company_email_value.endswith(".example.test"))
        company_slug = re.sub(r"[^a-z0-9]+", ".", unicodedata.normalize("NFKD", company_name).encode("ascii", "ignore").decode().lower()).strip(".")
        self.assertEqual(company_email_value.split("@", 1)[1], company_slug + ".example.test")

    def test_address_profile_keeps_selected_state_and_capital_together(self):
        formulas = [
            {"type": "faker", "catalogVersion": 1, "catalogId": "address.city", "params": {"state": "PE"}, "group": "location"},
            {"type": "faker", "catalogVersion": 1, "catalogId": "address.state_abbr", "params": {"state": "PE"}, "group": "location"},
        ]
        result = faker_catalog.generate_batch({"items": [
            {"key": json.dumps([formula, 0], separators=(",", ":")), "formula": formula} for formula in formulas
        ]})
        self.assertEqual(set(result["values"].values()), {"Recife", "PE"})

    def test_local_http_endpoints_expose_catalogue_and_preview(self):
        endpoint = object.__new__(server.Handler)
        endpoint.path = "/api/faker/catalog"
        endpoint._is_local_request = lambda: True
        endpoint._has_session = lambda mutation=False: True
        endpoint._send = lambda status, body, content_type, extra_headers=None: (status, json.loads(body), content_type)
        status, payload, content_type = server.Handler.do_GET(endpoint)
        self.assertEqual(status, 200)
        self.assertEqual(content_type, "application/json; charset=utf-8")
        self.assertEqual(payload["catalogVersion"], 1)

        endpoint.path = "/api/faker/preview"
        endpoint._read_body = lambda limit, content_type=None: json.dumps({"formula": {
            "type": "faker", "catalogVersion": 1, "catalogId": "person.name"}}).encode()
        status, payload, _ = server.Handler.do_POST(endpoint)
        self.assertEqual(status, 200)
        self.assertEqual(payload["catalogId"], "person.name")
        self.assertIsInstance(payload["value"], str)

    def test_powershell_bundle_rejects_faker_in_nested_formula(self):
        original = storage.get_variation
        config = storage.normalize_config({"rulesByMode": {"new": {
            '[{"ns":"","name":"R","index":1},{"ns":"","name":"Value","index":1}]': {
                "generator": {"type": "compose", "parts": [
                    {"type": "faker", "catalogVersion": 1, "catalogId": "person.name", "params": {}, "group": "cliente"}]}}}, "return": {}}})
        with patch.object(storage, "get_variation", return_value={"revision": 1, "config": config}), \
             patch.object(storage, "data_directory"):
            with self.assertRaisesRegex(ValueError, "PS1/BAT"):
                powershell_export.create_bundle("variation", 1)


if __name__ == "__main__":
    unittest.main()

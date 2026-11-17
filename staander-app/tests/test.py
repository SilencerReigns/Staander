# -*- coding: utf-8 -*-
"""Selenium E2E tests for auth and the current MVP.

Requires Python 3, Selenium, Google Chrome, and the API/client dev servers.
The suite creates one uniquely named test account in server/data.json.

Run from the repository root:
    python3 -m unittest discover -s staander-app/tests -p test.py -v

Show Chrome and slow interactions down:
    STAANDER_HEADLESS=0 STAANDER_ACTION_DELAY=0.6 python3 -m unittest discover -s staander-app/tests -p test.py -v
"""

import os
import tempfile
import time
import unittest
import uuid

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


BASE_URL = os.environ.get("STAANDER_BASE_URL", "http://localhost:5173")
WAIT_SECONDS = 5
ACTION_DELAY = max(0.0, float(os.environ.get("STAANDER_ACTION_DELAY", "0")))
HEADLESS = os.environ.get("STAANDER_HEADLESS", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)


class StaanderE2ETests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        if HEADLESS:
            options.add_argument("--headless=new")
        options.add_argument("--window-size=1440,1000")
        options.add_argument("--disable-gpu")

        driver_path = os.environ.get("CHROMEDRIVER")
        if driver_path:
            cls.driver = webdriver.Chrome(
                service=Service(executable_path=driver_path), options=options
            )
        else:
            cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)
        cls.action_delay = ACTION_DELAY
        cls.account_name = "Selenium {}".format(uuid.uuid4().hex[:8])
        cls.account_email = "selenium-{}@example.test".format(uuid.uuid4().hex)
        cls.account_password = "Selenium-test-123!"
        cls.register_test_account()

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    @classmethod
    def pause_setup(cls):
        time.sleep(cls.action_delay)

    @classmethod
    def register_test_account(cls):
        cls.driver.get(BASE_URL)
        cls.wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))
        cls.driver.find_element(By.CSS_SELECTOR, ".auth-switch button").click()
        cls.pause_setup()
        cls.wait.until(EC.visibility_of_element_located((By.ID, "auth-nome")))
        cls.driver.find_element(By.ID, "auth-nome").send_keys(cls.account_name)
        cls.pause_setup()
        cls.driver.find_element(By.ID, "auth-email").send_keys(cls.account_email)
        cls.pause_setup()
        cls.driver.find_element(By.ID, "auth-senha").send_keys(cls.account_password)
        cls.pause_setup()
        cls.driver.find_element(By.CSS_SELECTOR, ".auth-submit").click()
        cls.switch_to_mvp(cls.account_name)

        profile = cls.driver.execute_async_script(
            """
            const done = arguments[0];
            fetch('/api/me', {
              headers: { Authorization: 'Bearer ' + localStorage.getItem('staander_token') }
            }).then(response => response.json()).then(done).catch(() => done(null));
            """
        )
        if not profile or profile.get("role") != "user":
            raise AssertionError("Cadastro não criou uma conta comum válida.")
        cls.account_id = profile["id"]
        cls.driver.find_element(By.ID, "logoutButton").click()
        cls.driver.switch_to.default_content()
        cls.wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))

    @classmethod
    def switch_to_mvp(cls, expected_name):
        frame = cls.wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'iframe[src="/paginas/mvp/index.html"]')
            )
        )
        cls.driver.switch_to.frame(frame)
        cls.wait.until(
            lambda driver: driver.find_element(By.ID, "sidebarUserName").text
            == expected_name
        )

    def setUp(self):
        self.driver.switch_to.default_content()
        self.driver.get(BASE_URL)
        self.driver.execute_script(
            "window.localStorage.removeItem('staander_token');"
        )
        self.driver.refresh()
        self.wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))

    def pause(self):
        time.sleep(ACTION_DELAY)

    def fill(self, selector, value):
        field = self.wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
        )
        field.clear()
        field.send_keys(value)
        self.pause()
        return field

    def click(self, selector):
        button = self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
        )
        button.click()
        self.pause()
        return button

    def login(self, email=None, password=None):
        self.fill("#auth-email", email or self.account_email)
        self.fill("#auth-senha", password or self.account_password)
        self.click(".auth-submit")

    def enter_mvp(self):
        self.wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, 'iframe[src="/paginas/mvp/index.html"]')
            )
        )
        self.driver.switch_to.frame(
            self.driver.find_element(
                By.CSS_SELECTOR, 'iframe[src="/paginas/mvp/index.html"]'
            )
        )
        self.wait.until(
            lambda driver: driver.find_element(By.ID, "sidebarUserName").text
            == self.account_name
        )

    def api_request(self, method, path, body=None):
        return self.driver.execute_async_script(
            """
            const done = arguments[0];
            const method = arguments[1];
            const path = arguments[2];
            const body = arguments[3];
            const options = {
              method,
              headers: {
                Authorization: 'Bearer ' + localStorage.getItem('staander_token')
              }
            };
            if (body !== null) {
              options.headers['Content-Type'] = 'application/json';
              options.body = JSON.stringify(body);
            }
            fetch(path, options).then(async response => {
              const payload = await response.json().catch(() => null);
              done({ status: response.status, body: payload });
            }).catch(error => done({ status: 0, error: String(error) }));
            """,
            method,
            path,
            body,
        )

    def open_page(self, page):
        self.click('.nav[data-page="{}"]'.format(page))
        self.wait.until(
            lambda driver: "active"
            in driver.find_element(By.ID, page).get_attribute("class").split()
        )

    def confirm_delete(self):
        self.wait.until(EC.visibility_of_element_located((By.ID, "confirmModal")))
        self.click("#confirmOk")
        self.wait.until(
            lambda driver: "hidden"
            in driver.find_element(By.ID, "confirmModal").get_attribute("class").split()
        )

    def upload_pdf(self, title):
        self.open_page("library")
        self.click("#library .page-head .primary")
        self.wait.until(EC.visibility_of_element_located((By.ID, "modal")))

        file_path = os.path.join(tempfile.gettempdir(), title + ".pdf")
        with open(file_path, "wb") as pdf:
            pdf.write(b"%PDF-1.4\n% Selenium test PDF\n%%EOF\n")

        file_input = self.driver.find_element(By.ID, "fileInput")
        self.driver.execute_script(
            "arguments[0].hidden = false; arguments[0].style.display = 'block';",
            file_input,
        )
        file_input.send_keys(file_path)
        self.pause()

        card = self.wait.until(
            lambda driver: next(
                (
                    item
                    for item in driver.find_elements(
                        By.CSS_SELECTOR, "#libraryGrid .book"
                    )
                    if item.get_attribute("data-title") == title
                ),
                False,
            )
        )
        return card.get_attribute("data-id"), file_path

    def test_login_rejects_invalid_credentials(self):
        email = "missing-{}@example.test".format(uuid.uuid4().hex)
        self.login(email, "wrong-password")
        message = self.wait.until(
            lambda driver: driver.find_element(By.CSS_SELECTOR, ".auth-message").text
        )
        self.assertIn("Email ou senha incorretos", message)

    def test_registration_login_profile_logout_and_role_guard(self):
        self.login()
        self.enter_mvp()

        profile = self.api_request("GET", "/api/me")
        self.assertEqual(profile["status"], 200)
        self.assertEqual(profile["body"]["id"], self.account_id)
        self.assertEqual(profile["body"]["role"], "user")
        self.assertFalse(self.driver.find_element(By.ID, "navAdmin").is_displayed())
        self.assertEqual(
            self.api_request("GET", "/api/admin/overview")["status"], 403
        )
        self.assertEqual(self.api_request("GET", "/api/admin/progress")["status"], 403)

        self.click("#logoutButton")
        self.driver.switch_to.default_content()
        self.wait.until(EC.visibility_of_element_located((By.ID, "auth-email")))

        self.login()
        self.enter_mvp()
        self.assertEqual(
            self.driver.find_element(By.ID, "sidebarUserName").text,
            self.account_name,
        )

    def test_items_crud_api(self):
        self.login()
        self.enter_mvp()
        title = "Selenium item {}".format(uuid.uuid4().hex[:8])
        created = self.api_request(
            "POST",
            "/api/items",
            {
                "titulo": title,
                "tipo": "PDF",
                "tamanho": "1 KB",
                "status": "nao_lido",
                "usuarioId": "another-user",
            },
        )
        self.assertEqual(created["status"], 201)
        item_id = created["body"]["id"]
        self.assertEqual(created["body"]["usuarioId"], self.account_id)

        try:
            updated = self.api_request(
                "PUT",
                "/api/items/{}".format(item_id),
                {"titulo": title + " editado", "status": "em_leitura"},
            )
            self.assertEqual(updated["status"], 200)
            fetched = self.api_request("GET", "/api/items/{}".format(item_id))
            self.assertEqual(fetched["body"]["titulo"], title + " editado")
            self.assertEqual(fetched["body"]["usuarioId"], self.account_id)
        finally:
            deleted = self.api_request("DELETE", "/api/items/{}".format(item_id))
            self.assertIn(deleted["status"], (200, 404))

        self.assertEqual(
            self.api_request("GET", "/api/items/{}".format(item_id))["status"],
            404,
        )

    def test_tags_crud_api(self):
        self.login()
        self.enter_mvp()
        name = "Selenium tag {}".format(uuid.uuid4().hex[:8])
        created = self.api_request(
            "POST", "/api/tags", {"nome": name, "usuarioId": "another-user"}
        )
        self.assertEqual(created["status"], 201)
        tag_id = created["body"]["id"]
        self.assertEqual(created["body"]["usuarioId"], self.account_id)

        try:
            updated = self.api_request(
                "PUT", "/api/tags/{}".format(tag_id), {"nome": name + " editada"}
            )
            self.assertEqual(updated["status"], 200)
            fetched = self.api_request("GET", "/api/tags/{}".format(tag_id))
            self.assertEqual(fetched["body"]["nome"], name + " editada")
        finally:
            deleted = self.api_request("DELETE", "/api/tags/{}".format(tag_id))
            self.assertIn(deleted["status"], (200, 404))

        self.assertEqual(
            self.api_request("GET", "/api/tags/{}".format(tag_id))["status"], 404
        )

    def test_mvp_import_and_delete_pdf(self):
        self.login()
        self.enter_mvp()
        title = "Selenium PDF {}".format(uuid.uuid4().hex[:8])
        item_id = None
        file_path = None
        try:
            item_id, file_path = self.upload_pdf(title)
            self.assertTrue(item_id)
            self.assertEqual(
                self.api_request("GET", "/api/items/{}".format(item_id))["status"],
                200,
            )

            card = self.driver.find_element(
                By.CSS_SELECTOR, '.book[data-id="{}"]'.format(item_id)
            )
            ActionChains(self.driver).move_to_element(card).perform()
            self.pause()
            self.click(
                '.book[data-id="{}"] [data-delete]'.format(item_id)
            )
            self.confirm_delete()
            self.wait.until(
                lambda driver: not driver.find_elements(
                    By.CSS_SELECTOR, '.book[data-id="{}"]'.format(item_id)
                )
            )
            item_id = None
        finally:
            if item_id:
                self.api_request("DELETE", "/api/items/{}".format(item_id))
            if file_path and os.path.exists(file_path):
                os.remove(file_path)

    def test_mvp_notes_create_update_delete(self):
        self.login()
        self.enter_mvp()
        title = "Selenium note PDF {}".format(uuid.uuid4().hex[:8])
        item_id = None
        file_path = None
        note_id = None
        try:
            item_id, file_path = self.upload_pdf(title)
            self.open_page("notes")
            self.click("#notes .page-head .primary")
            self.wait.until(EC.visibility_of_element_located((By.ID, "noteModal")))
            Select(self.driver.find_element(By.ID, "noteItem")).select_by_value(item_id)

            content = "Nota Selenium {}".format(uuid.uuid4().hex[:8])
            edited_content = content + " editada"
            self.fill("#notePage", "1")
            self.fill("#noteText", content)
            self.click("#noteSave")
            self.wait.until(
                lambda driver: any(
                    content in row.text
                    for row in driver.find_elements(
                        By.CSS_SELECTOR, "#notesList .note-row"
                    )
                )
            )

            notes = self.api_request("GET", "/api/notes")
            note = next(
                (
                    item
                    for item in notes["body"]
                    if item["conteudo"] == content and item["itemId"] == item_id
                ),
                None,
            )
            self.assertIsNotNone(note)
            note_id = note["id"]

            updated = self.api_request(
                "PUT",
                "/api/notes/{}".format(note_id),
                {"conteudo": edited_content, "posicao": "2"},
            )
            self.assertEqual(updated["status"], 200)
            self.driver.execute_async_script(
                "const done = arguments[0]; loadData().then(done);"
            )
            self.wait.until(
                lambda driver: any(
                    edited_content in row.text
                    for row in driver.find_elements(
                        By.CSS_SELECTOR, "#notesList .note-row"
                    )
                )
            )

            self.click(
                '#notesList [data-delete-note="{}"]'.format(note_id)
            )
            self.confirm_delete()
            self.wait.until(
                lambda driver: not driver.find_elements(
                    By.CSS_SELECTOR,
                    '#notesList [data-delete-note="{}"]'.format(note_id),
                )
            )
            note_id = None
        finally:
            if note_id:
                self.api_request("DELETE", "/api/notes/{}".format(note_id))
            if item_id:
                self.api_request("DELETE", "/api/items/{}".format(item_id))
            if file_path and os.path.exists(file_path):
                os.remove(file_path)


if __name__ == "__main__":
    unittest.main(verbosity=2)

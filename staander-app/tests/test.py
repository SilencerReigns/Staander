"""Testes E2E dos CRUDs atuais do Staander.

Pré-requisitos:
    - API em http://localhost:5150
    - Frontend em http://localhost:5173
    - Google Chrome instalado
    - python -m pip install selenium
    - se o Selenium Manager não localizar o driver, definir CHROMEDRIVER

Execução a partir da raiz do repositório:
    python -m unittest discover -s staander-app/tests -p test.py -v
"""

import os
import unittest
import uuid

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.common.exceptions import StaleElementReferenceException
from selenium.webdriver.chrome.service import Service


BASE_URL = os.environ.get("STAANDER_BASE_URL", "http://localhost:5173")
WAIT_SECONDS = 15


class StaanderCRUDTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1440,1000")

        driver_path = os.environ.get("CHROMEDRIVER")
        if driver_path:
            cls.driver = webdriver.Chrome(
                service=Service(executable_path=driver_path), options=options
            )
        else:
            # Selenium Manager encontra automaticamente um driver compatível.
            cls.driver = webdriver.Chrome(options=options)
        cls.wait = WebDriverWait(cls.driver, WAIT_SECONDS)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "driver"):
            cls.driver.quit()

    def setUp(self):
        self.driver.get(BASE_URL)
        self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'a[href="#app"]'))
        )
        self.driver.find_element(By.CSS_SELECTOR, 'a[href="#app"]').click()
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "section#biblioteca"))
        )

    def section(self, section_id):
        return self.driver.find_element(By.ID, section_id)

    def open_section(self, section_id):
        """Rola até a seção sem trocar o hash de rota do app."""
        section = self.section(section_id)
        self.driver.execute_script(
            "arguments[0].scrollIntoView({block: 'start'});", section
        )
        self.wait.until(lambda _driver: section.is_displayed())
        self.wait.until(lambda _driver: "Carregando" not in section.text)
        return section

    def rows(self, section_id):
        section = self.section(section_id)
        tables = section.find_elements(By.CSS_SELECTOR, "table tbody tr")
        return tables

    def row_for(self, section_id, text):
        row = self.find_row(section_id, text)
        if row:
            return row
        self.fail(f"Não encontrei a linha '{text}' na seção #{section_id}.")

    def find_row(self, section_id, text):
        # Reconsulta a tabela a cada tentativa: React substitui as linhas quando
        # a lista muda e referências antigas podem ficar obsoletas.
        for _ in range(3):
            try:
                for row in self.rows(section_id):
                    if text in (row.get_attribute("innerText") or ""):
                        return row
            except StaleElementReferenceException:
                continue
        return None

    def field(self, section, label, control="input"):
        xpath = (
            f".//form//label[contains(normalize-space(.), '{label}')]"
            f"/following-sibling::{control}[1]"
        )
        return section.find_element(By.XPATH, xpath)

    def submit(self, section):
        section.find_element(By.CSS_SELECTOR, "form button[type='submit']").click()

    def wait_for_toast(self, section_id, expected_text):
        def toast_result(_driver):
            try:
                messages = [
                    toast.get_attribute("innerText")
                    for toast in self.section(section_id).find_elements(
                        By.CSS_SELECTOR, ".toast"
                    )
                ]
            except StaleElementReferenceException:
                return False
            if any(message and message.startswith("Erro:") for message in messages):
                raise AssertionError("A aplicação recusou a operação: " + " | ".join(messages))
            return any(expected_text in (message or "") for message in messages)

        self.wait.until(toast_result)

    def delete_row(self, section_id, row):
        row.find_element(By.XPATH, ".//button[contains(., 'Excluir')]").click()
        alert = self.wait.until(EC.alert_is_present())
        alert.accept()

    def create_item(self, title):
        section = self.open_section("biblioteca")
        old_count = len(self.rows("biblioteca"))

        self.field(section, "Título").send_keys(title)
        Select(self.field(section, "Tipo", "select")).select_by_value("PDF")
        self.field(section, "Tamanho").send_keys("2 MB")
        Select(self.field(section, "Status", "select")).select_by_value("nao_lido")
        self.submit(section)

        self.wait_for_toast("biblioteca", "Item criado com sucesso")
        self.wait.until(lambda _driver: len(self.rows("biblioteca")) == old_count + 1)
        return self.row_for("biblioteca", title)

    def test_01_crud_itens(self):
        self.open_section("biblioteca")
        original_count = len(self.rows("biblioteca"))
        suffix = uuid.uuid4().hex[:8]
        title = f"Livro Selenium {suffix}"
        edited_title = f"Livro Selenium editado {suffix}"
        try:
            self.create_item(title)
            row = self.row_for("biblioteca", title)
            row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()

            section = self.section("biblioteca")
            title_input = self.field(section, "Título")
            title_input.clear()
            title_input.send_keys(edited_title)
            self.submit(section)

            self.wait_for_toast("biblioteca", "Item atualizado com sucesso")
            self.wait.until(
                lambda _driver: self.find_row("biblioteca", edited_title) is not None
            )

            row = self.row_for("biblioteca", edited_title)
            self.delete_row("biblioteca", row)
            self.wait.until(lambda _driver: len(self.rows("biblioteca")) == original_count)
        finally:
            row = self.find_row("biblioteca", title) or self.find_row(
                "biblioteca", edited_title
            )
            if row:
                self.delete_row("biblioteca", row)
                self.wait.until(
                    lambda _driver: not self.find_row("biblioteca", title)
                    and not self.find_row("biblioteca", edited_title)
                )

    def test_02_crud_tags(self):
        section = self.open_section("tags")
        original_count = len(self.rows("tags"))
        suffix = uuid.uuid4().hex[:8]
        name = f"Tag Selenium {suffix}"
        edited_name = f"Tag Selenium editada {suffix}"
        try:
            self.field(section, "Nome").send_keys(name)
            self.submit(section)

            self.wait_for_toast("tags", "Tag criada com sucesso")
            self.wait.until(lambda _driver: len(self.rows("tags")) == original_count + 1)
            row = self.row_for("tags", name)
            row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()

            name_input = self.field(section, "Nome")
            name_input.clear()
            name_input.send_keys(edited_name)
            self.submit(section)

            self.wait_for_toast("tags", "Tag atualizada com sucesso")
            self.wait.until(
                lambda _driver: self.find_row("tags", edited_name) is not None
            )

            self.delete_row("tags", self.row_for("tags", edited_name))
            self.wait.until(lambda _driver: len(self.rows("tags")) == original_count)
        finally:
            row = self.find_row("tags", name) or self.find_row("tags", edited_name)
            if row:
                self.delete_row("tags", row)
                self.wait.until(
                    lambda _driver: not self.find_row("tags", name)
                    and not self.find_row("tags", edited_name)
                )

    def test_03_crud_notas(self):
        self.open_section("biblioteca")
        suffix = uuid.uuid4().hex[:8]
        item_title = f"Item base Selenium {suffix}"
        note_text = f"Nota Selenium {suffix}"
        edited_note_text = f"Nota Selenium editada {suffix}"
        created_item = False

        try:
            # A nota precisa estar vinculada a um item existente.
            items = self.rows("biblioteca")
            if not items:
                self.create_item(item_title)
                created_item = True
                # O formulário de notas carrega seus itens ao montar a página.
                self.driver.refresh()
                self.wait.until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, "section#biblioteca")
                    )
                )

            notes_section = self.open_section("notas")
            original_notes = len(self.rows("notas"))

            item_select = Select(self.field(notes_section, "Item relacionado", "select"))
            item_select.select_by_index(1)
            self.field(notes_section, "Conteúdo da nota", "textarea").send_keys(note_text)
            self.field(notes_section, "Posição").send_keys("Página 10")
            self.submit(notes_section)

            self.wait_for_toast("notas", "Nota criada com sucesso")
            self.wait.until(lambda _driver: len(self.rows("notas")) == original_notes + 1)
            row = self.row_for("notas", note_text)
            row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()

            notes_section = self.section("notas")
            content = self.field(notes_section, "Conteúdo da nota", "textarea")
            content.clear()
            content.send_keys(edited_note_text)
            self.submit(notes_section)

            self.wait_for_toast("notas", "Nota atualizada com sucesso")
            self.wait.until(
                lambda _driver: self.find_row("notas", edited_note_text) is not None
            )

            self.delete_row("notas", self.row_for("notas", edited_note_text))
            self.wait.until(lambda _driver: len(self.rows("notas")) == original_notes)
        finally:
            # Remove a nota de teste caso uma etapa anterior tenha falhado.
            note_row = self.find_row("notas", note_text) or self.find_row(
                "notas", edited_note_text
            )
            if note_row:
                self.delete_row("notas", note_row)
                self.wait.until(
                    lambda _driver: not self.find_row("notas", note_text)
                    and not self.find_row("notas", edited_note_text)
                )

            # Remove o item de apoio criado por este teste, se necessário.
            if created_item:
                self.open_section("biblioteca")
                item_row = self.row_for("biblioteca", item_title)
                self.delete_row("biblioteca", item_row)
                self.wait.until(
                    lambda _driver: not any(
                        item_title in (row.get_attribute("innerText") or "")
                        for row in self.rows("biblioteca")
                    )
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)

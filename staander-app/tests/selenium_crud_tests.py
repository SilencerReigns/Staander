"""
Testes de ponta a ponta (E2E) com Selenium para o Staander Release 2.
Valida os 3 CRUDs (Itens, Tags, Notas) através da interface web React.

Pré-requisitos:
- Backend rodando em http://localhost:5150
- Frontend rodando em http://localhost:5173
- Chrome instalado
"""

import time
import unittest
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

BASE_URL = "http://localhost:5173"


class StaanderCRUDTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        service = Service(ChromeDriverManager().install())
        cls.driver = webdriver.Chrome(service=service, options=options)
        cls.wait = WebDriverWait(cls.driver, 10)

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    # ---------- helpers ----------
    def toast_visible(self, timeout=3):
        try:
            return self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "toast"))).is_displayed()
        except Exception:
            return False

    def wait_row_count(self, table_selector, expected_min=1, timeout=5):
        try:
            WebDriverWait(self.driver, timeout).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, f"{table_selector} tbody tr")) >= expected_min
            )
            return True
        except Exception:
            return False

    # ---------- TESTE 1: CRUD de Itens ----------
    def test_01_crud_itens(self):
        driver = self.driver
        driver.get(BASE_URL)
        time.sleep(1)

        # Vai para a seção Biblioteca (Itens)
        driver.find_element(By.XPATH, "//button[contains(text(), 'Biblioteca')]").click()
        time.sleep(0.5)

        # Estado inicial: vazio ou com itens existentes
        rows_before = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))

        # Cria um item
        driver.find_element(By.XPATH, "//input[@placeholder or @name or contains(@class,'') and ancestor::label[contains(.,'Título')]]").send_keys("Livro de Teste Selenium")
        tipo_select = driver.find_element(By.XPATH, "//label[contains(.,'Tipo')]/following-sibling::select")
        from selenium.webdriver.support.ui import Select
        Select(tipo_select).select_by_visible_text("PDF")
        driver.find_element(By.XPATH, "//label[contains(.,'Tamanho')]/following-sibling::input").send_keys("2.5 MB")
        status_select = driver.find_element(By.XPATH, "//label[contains(.,'Status')]/following-sibling::select")
        Select(status_select).select_by_visible_text("Não lido")
        driver.find_element(By.XPATH, "//button[contains(., 'Criar item')]").click()
        time.sleep(1)

        # Verifica toast de sucesso
        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao criar item")

        # Verifica se o item apareceu na tabela
        self.assertTrue(self.wait_row_count("table", rows_before + 1), "Item não apareceu na tabela após criação")

        # Edita o item criado (última linha)
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        last_row = rows[-1]
        last_row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()
        time.sleep(0.5)

        titulo_input = driver.find_element(By.XPATH, "//label[contains(.,'Título')]/following-sibling::input")
        titulo_input.clear()
        titulo_input.send_keys("Livro de Teste Selenium (Editado)")
        driver.find_element(By.XPATH, "//button[contains(., 'Salvar alterações')]").click()
        time.sleep(1)

        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao editar item")

        # Verifica edição refletida na tabela
        edited_cell = driver.find_element(By.XPATH, "//table//tr[last()]//td[1]")
        self.assertIn("Livro de Teste Selenium (Editado)", edited_cell.text)

        # Exclui o item
        driver.find_element(By.XPATH, "//table//tr[last()]//button[contains(., 'Excluir')]").click()
        time.sleep(0.5)
        # Confirma o alerta
        alert = driver.switch_to.alert
        alert.accept()
        time.sleep(1)

        # Verifica que o item sumiu (contagem voltou ao inicial)
        rows_after = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))
        self.assertEqual(rows_after, rows_before, "Item não foi excluído da tabela")

    # ---------- TESTE 2: CRUD de Tags ----------
    def test_02_crud_tags(self):
        driver = self.driver
        driver.get(BASE_URL)
        time.sleep(1)

        # Vai para a seção Tags
        driver.find_element(By.XPATH, "//button[contains(text(), 'Tags')]").click()
        time.sleep(0.5)

        rows_before = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))

        # Cria uma tag
        driver.find_element(By.XPATH, "//label[contains(.,'Nome')]/following-sibling::input").send_keys("Estudo")
        driver.find_element(By.XPATH, "//button[contains(., 'Criar tag')]").click()
        time.sleep(1)

        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao criar tag")
        self.assertTrue(self.wait_row_count("table", rows_before + 1), "Tag não apareceu na tabela")

        # Edita a tag criada
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        last_row = rows[-1]
        last_row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()
        time.sleep(0.5)

        nome_input = driver.find_element(By.XPATH, "//label[contains(.,'Nome')]/following-sibling::input")
        nome_input.clear()
        nome_input.send_keys("Estudo (Editado)")
        driver.find_element(By.XPATH, "//button[contains(., 'Salvar alterações')]").click()
        time.sleep(1)

        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao editar tag")
        edited_cell = driver.find_element(By.XPATH, "//table//tr[last()]//td[1]")
        self.assertIn("Estudo (Editado)", edited_cell.text)

        # Exclui a tag
        driver.find_element(By.XPATH, "//table//tr[last()]//button[contains(., 'Excluir')]").click()
        time.sleep(0.5)
        alert = driver.switch_to.alert
        alert.accept()
        time.sleep(1)

        rows_after = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))
        self.assertEqual(rows_after, rows_before, "Tag não foi excluída da tabela")

    # ---------- TESTE 3: CRUD de Notas ----------
    def test_03_crud_notas(self):
        driver = self.driver
        driver.get(BASE_URL)
        time.sleep(1)

        # Precisa de pelo menos um item para vincular a nota
        driver.find_element(By.XPATH, "//button[contains(text(), 'Biblioteca')]").click()
        time.sleep(0.5)

        rows_itens = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))
        if rows_itens == 0:
            # Cria um item rápido
            driver.find_element(By.XPATH, "//label[contains(.,'Título')]/following-sibling::input").send_keys("Item para Nota")
            Select(driver.find_element(By.XPATH, "//label[contains(.,'Tipo')]/following-sibling::select")).select_by_visible_text("PDF")
            driver.find_element(By.XPATH, "//label[contains(.,'Tamanho')]/following-sibling::input").send_keys("1 MB")
            Select(driver.find_element(By.XPATH, "//label[contains(.,'Status')]/following-sibling::select")).select_by_visible_text("Não lido")
            driver.find_element(By.XPATH, "//button[contains(., 'Criar item')]").click()
            time.sleep(1)

        # Vai para a seção Notas
        driver.find_element(By.XPATH, "//button[contains(text(), 'Notas')]").click()
        time.sleep(0.5)

        rows_before = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))

        # Cria uma nota
        item_select = driver.find_element(By.XPATH, "//label[contains(.,'Item relacionado')]/following-sibling::select")
        Select(item_select).select_by_index(1)  # pula o "Selecione um item"
        driver.find_element(By.XPATH, "//label[contains(.,'Conteúdo da nota')]/following-sibling::textarea").send_keys("Esta é uma nota de teste criada pelo Selenium.")
        driver.find_element(By.XPATH, "//label[contains(.,'Posição')]/following-sibling::input").send_keys("Página 10")
        driver.find_element(By.XPATH, "//button[contains(., 'Criar nota')]").click()
        time.sleep(1)

        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao criar nota")
        self.assertTrue(self.wait_row_count("table", rows_before + 1), "Nota não apareceu na tabela")

        # Edita a nota criada
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        last_row = rows[-1]
        last_row.find_element(By.XPATH, ".//button[contains(., 'Editar')]").click()
        time.sleep(0.5)

        conteudo_area = driver.find_element(By.XPATH, "//label[contains(.,'Conteúdo da nota')]/following-sibling::textarea")
        conteudo_area.clear()
        conteudo_area.send_keys("Nota de teste editada pelo Selenium.")
        driver.find_element(By.XPATH, "//button[contains(., 'Salvar alterações')]").click()
        time.sleep(1)

        self.assertTrue(self.toast_visible(), "Toast de sucesso não apareceu ao editar nota")
        edited_cell = driver.find_element(By.XPATH, "//table//tr[last()]//td[2]")
        self.assertIn("Nota de teste editada pelo Selenium", edited_cell.text)

        # Exclui a nota
        driver.find_element(By.XPATH, "//table//tr[last()]//button[contains(., 'Excluir')]").click()
        time.sleep(0.5)
        alert = driver.switch_to.alert
        alert.accept()
        time.sleep(1)

        rows_after = len(driver.find_elements(By.CSS_SELECTOR, "table tbody tr"))
        self.assertEqual(rows_after, rows_before, "Nota não foi excluída da tabela")


if __name__ == "__main__":
    unittest.main()

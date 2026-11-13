// QA-043 — Menu do usuário (.user-menu-list) cortado em telas baixas.
// O dropdown tem 11 itens, é position:absolute dentro do header sticky e não
// tinha max-height nem rolagem: em celulares/janelas baixas o fim da lista
// ("Alto contraste", "Sair") passava do rodapé, e no mobile ainda ficava
// atrás da .bottom-nav (z-index 240 > header 200), sem como alcançá-lo.
// Corrigido com max-height + overflow-y:auto, reservando o espaço da
// .bottom-nav no mobile.
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'header.css'), 'utf8');

// Corpo de uma regra pelo seletor exato, dentro de um trecho de CSS.
const ruleBody = (source, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = source.match(new RegExp('(?:^|\\})\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[1] : null;
};

// Trecho do bloco @media (max-width: 860px) que contém .bottom-nav { display: flex }.
const mobileBlock = () => {
  const re = /@media \(max-width: 860px\) \{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    while (depth && i < css.length) { depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0; i++; }
    const block = css.slice(re.lastIndex, i - 1);
    if (/\.user-menu-list\s*\{/.test(block)) return block;
  }
  return null;
};

describe('QA-043 — menu do usuário rola e não fica atrás da barra inferior', () => {
  test('.user-menu-list tem max-height limitado à altura da tela', () => {
    const body = ruleBody(css, '.user-menu-list');
    expect(body).not.toBeNull();
    expect(body).toMatch(/max-height:\s*calc\(100dvh/);
  });

  test('.user-menu-list rola por dentro (overflow-y: auto) sem vazar a rolagem para a página', () => {
    const body = ruleBody(css, '.user-menu-list');
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/overscroll-behavior:\s*contain/);
  });

  test('há fallback com 100vh para navegadores sem suporte a dvh', () => {
    const body = ruleBody(css, '.user-menu-list');
    expect(body).toMatch(/max-height:\s*calc\(100vh/);
    expect(body.indexOf('100vh')).toBeLessThan(body.indexOf('100dvh'));
  });

  test('no mobile (≤860px) o max-height reserva o espaço da .bottom-nav e a área segura', () => {
    const block = mobileBlock();
    expect(block).not.toBeNull();
    const body = ruleBody(block, '.user-menu-list');
    expect(body).toMatch(/max-height:[^;]*92px/);
    expect(body).toMatch(/safe-area-inset-bottom/);
  });
});

# robofight

robofight é uma arena de combate local para dois robôs programados em JavaScript. Cada competidor possui seu próprio editor, console, barra de integridade e placar; durante a batalha, os robôs analisam o adversário, movimentam-se, desviam de projéteis e disparam de forma autônoma.

O projeto roda diretamente no navegador e não exige instalação de dependências ou etapa de build.

## Funcionalidades

- Dois editores de estratégia JavaScript executados separadamente em Web Workers.
- Arena animada em Canvas, com projéteis, dano, explosões e placar.
- Controles para iniciar, pausar, reiniciar e alterar a velocidade da batalha.
- Detecção de erros de compilação, execução e limite de tempo por turno.
- Persistência do nome e do código de cada robô no `localStorage`.
- Interface responsiva para desktop e dispositivos móveis.

## Como executar

Como os Web Workers não funcionam de forma consistente pelo protocolo `file://`, sirva a pasta por HTTP. Por exemplo, com Python 3:

```bash
cd /caminho/para/robo
python3 -m http.server 8080
```

Depois, acesse [http://localhost:8080](http://localhost:8080) em um navegador moderno.

Também é possível usar qualquer outro servidor de arquivos estáticos, como `npx serve` ou a extensão Live Server.

## Como jogar

1. Escolha o nome dos dois robôs.
2. Edite a estratégia JavaScript em cada painel.
3. Clique em **Iniciar batalha**.
4. Acompanhe a integridade, os consoles e o placar.
5. Use o mesmo botão para pausar ou continuar; o botão ao lado reinicia a arena.

Cada editor deve declarar uma constante `robot` com um método `tick(api)`. Esse método é chamado uma vez por turno e recebe a API da arena.

```js
const robot = {
  tick(api) {
    const enemy = api.scan();
    const me = api.status();

    // Gira em direção ao adversário e se aproxima.
    api.turn(enemy.angle);
    api.move(enemy.distance > 200 ? 5 : -2);

    // Dispara quando a arma está pronta e o alvo está alinhado.
    if (me.cooldown === 0 && Math.abs(enemy.angle) <= 18) {
      api.fire();
    }
  }
};
```

## API do robô

| Método | Retorno / efeito |
| --- | --- |
| `api.scan()` | Retorna `{ distance, angle, energy }` do adversário. O ângulo é relativo à direção atual do robô. |
| `api.projectiles()` | Lista projéteis inimigos como `{ distance, incoming, missDistance, timeToImpact, dodgeAngle }`. |
| `api.status()` | Retorna `{ energy, cooldown, turn }` do próprio robô. |
| `api.move(valor)` | Avança ou recua. O valor é limitado ao intervalo de `-5` a `5`. |
| `api.turn(graus)` | Gira o robô. O valor é limitado ao intervalo de `-18` a `18` graus por turno. |
| `api.fire()` | Dispara na direção atual quando a arma não está em recarga. |
| `api.log(mensagem)` | Exibe uma mensagem no console do robô. São aceitas até três mensagens por turno. |

As chamadas de movimento, giro e disparo registram as ações daquele turno. Se um método for chamado mais de uma vez, prevalece o último valor registrado para movimento e giro.

## Regras da arena

- Cada robô começa com `100` pontos de integridade.
- Cada acerto causa `5` pontos de dano.
- Após um disparo, a arma entra em recarga por `16` turnos.
- A batalha termina quando um robô chega a zero de integridade ou após `1800` turnos.
- No limite de turnos, vence o robô com mais integridade; valores iguais resultam em empate.
- Cada execução de `tick` tem limite de `70 ms`. Exceder esse tempo causa desclassificação.
- O robô permanece dentro dos limites da arena automaticamente.

## Estrutura do projeto

```text
.
├── index.html   # Estrutura da interface
├── styles.css   # Layout, responsividade e identidade visual
├── app.js       # Simulação, renderização e API dos robôs
└── README.md
```

## Tecnologias

- HTML5
- CSS3
- JavaScript
- Canvas API
- Web Workers
- Web Storage API

## Observações

O código digitado nos editores é executado pelo navegador. Use apenas estratégias de fontes confiáveis. As fontes visuais são carregadas pelo Google Fonts; sem acesso à internet, o jogo continua funcionando com as fontes alternativas do sistema.

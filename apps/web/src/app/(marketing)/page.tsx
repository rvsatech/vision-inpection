import Link from 'next/link';
import DroneSection from '@/components/drone/DroneLazy';
import { DetectionOverlay } from '@/components/DetectionOverlay';
import { Plans } from '@/components/landing/Plans';
import { SmoothScroll } from '@/components/landing/SmoothScroll';
import { Logo } from '@/components/Logo';
import { DEMO } from '@/lib/demo-results';
import { metricLabel, metricValue } from '@/lib/format';
import styles from '@/components/landing/landing.module.css';


const SERVICES = [
  {
    file: 'defect_00.jpg',
    title: 'Inspeção de qualidade',
    body: 'Encontra riscos, manchas e falhas de superfície em chapas e peças usinadas antes que sigam para a expedição.',
    keys: ['defects', 'affectedAreaPct'],
  },
  {
    file: 'ppe_hero.jpg',
    title: 'Conformidade de EPI',
    body: 'Aponta quem está sem capacete ou colete em áreas operacionais e gera o registro com imagem para a CIPA.',
    keys: ['persons', 'complianceRate'],
  },
  {
    file: 'count_03.jpg',
    title: 'Contagem de objetos',
    body: 'Conta caixas, peças e paletes em uma foto da esteira ou do estoque e confronta com a ordem de produção.',
    keys: ['count'],
  },
];

const STEPS = [
  { title: 'Capture', body: 'Envie fotos pelo celular ou conecte as câmeras IP que já existem na linha.' },
  { title: 'Enfileire', body: 'Cada imagem entra em uma fila de processamento; picos de volume não travam o sistema.' },
  { title: 'Analise', body: 'Modelos de visão computacional classificam a imagem em segundos e marcam cada achado.' },
  { title: 'Aja', body: 'Não conformidades geram alerta, entram no histórico e ficam disponíveis para auditoria.' },
];

export default function LandingPage() {
  const hero = DEMO['ppe_hero.jpg'];
  return (
    <>
      <SmoothScroll />
      <a href="#conteudo" className="sr-only">
        Pular para o conteúdo
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="Vision Inspect — início">
            <Logo />
          </Link>
          <nav className={styles.nav} aria-label="Principal">
            <a href="#servicos">Serviços</a>
            <a href="#sobrevoo">Sobrevoo</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#empresa">Empresa</a>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/login" className="btn btn-ghost">
              Entrar
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Testar grátis
            </Link>
          </div>
        </div>
      </header>

      <main id="conteudo">
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>Veja na hora o que a inspeção manual deixa passar.</h1>
            <p className={styles.heroLead}>
              A Vision Inspect analisa fotos e câmeras da sua planta para encontrar defeitos de superfície, colaboradores sem EPI e
              divergências de contagem, e guarda cada achado com a imagem como evidência.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/signup" className="btn btn-primary btn-lg">
                Testar 14 dias grátis
              </Link>
              <a href="#sobrevoo" className="btn btn-secondary btn-lg">
                Ver o sobrevoo
              </a>
            </div>
            <p className={styles.heroNote}>Sem cartão de crédito no período de teste.</p>
          </div>
          <div className={styles.heroVisual}>
            <DetectionOverlay src="/demo/ppe_hero.jpg" alt="Área operacional com quatro colaboradores; dois sinalizados por falta de EPI" detections={hero.detections} animate />
            <div className={styles.heroResult}>
              <span className="tag tag-fail">Não conforme</span>
              <span>{hero.headline}</span>
            </div>
          </div>
        </section>

        <section id="servicos" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Três inspeções que rodam sozinhas</h2>
            <p className={styles.sectionLead}>
              Cada serviço devolve um veredito, as métricas da imagem e a posição de cada achado. Os exemplos abaixo são saídas reais do
              sistema.
            </p>
          </div>
          <div className={styles.services}>
            {SERVICES.map((s) => {
              const d = DEMO[s.file];
              return (
                <article key={s.file} className={styles.service}>
                  <DetectionOverlay src={`/demo/${s.file}`} alt={`Exemplo de ${s.title.toLowerCase()}`} detections={d.detections} showLabels={false} />
                  <h3 className={styles.serviceTitle}>{s.title}</h3>
                  <p className={styles.serviceBody}>{s.body}</p>
                  <dl className={styles.metrics}>
                    {s.keys.map((k) => (
                      <div key={k}>
                        <dt>{metricLabel(k)}</dt>
                        <dd>{metricValue(k, d.metrics[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <div id="sobrevoo">
          <DroneSection />
        </div>

        <section id="como-funciona" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Da câmera ao relatório</h2>
            <p className={styles.sectionLead}>Nenhuma etapa depende de alguém lembrar de olhar.</p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="empresa" className={`${styles.section} ${styles.about}`}>
          <div>
            <h2 className={styles.h2}>Sobre a Vision Inspect</h2>
            <p className={styles.aboutText}>
              Somos uma equipe de engenharia de software e visão computacional dedicada a pequenas e médias indústrias. Começamos
              instalando câmeras em linhas de embalagem e percebemos que o problema raramente é o hardware: é transformar imagem em
              decisão no turno certo. A plataforma nasceu para isso.
            </p>
            <p className={styles.aboutText}>
              Implantamos com você: escolhemos os pontos de captura, calibramos os modelos com imagens da sua linha e treinamos a equipe
              de qualidade e segurança.
            </p>
          </div>
          <div className={styles.trust}>
            <h3>Segurança e LGPD</h3>
            <ul>
              <li>Acesso por papel: proprietário, administrador, inspetor e leitura.</li>
              <li>Trilha de auditoria de logins, alterações e cobranças.</li>
              <li>Imagens removidas automaticamente após o prazo de retenção (90 dias por padrão).</li>
              <li>Tráfego sempre cifrado e sessões que podem ser encerradas a qualquer momento.</li>
            </ul>
          </div>
        </section>

        <section id="planos" className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>Planos</h2>
            <p className={styles.sectionLead}>Comece com 14 dias de teste do plano escolhido. Cancele quando quiser.</p>
          </div>
          <Plans />
        </section>

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>Mande uma foto da sua linha e veja o resultado hoje.</h2>
          <Link href="/signup" className="btn btn-lg" style={{ background: '#fff', color: 'var(--petrol)' }}>
            Criar conta de teste
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo size={22} />
          <p>Vision Inspect Tecnologia Industrial Ltda.</p>
          <a href="mailto:comercial@visioninspect.com.br">comercial@visioninspect.com.br</a>
        </div>
      </footer>
    </>
  );
}

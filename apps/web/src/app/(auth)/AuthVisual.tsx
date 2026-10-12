import { DetectionOverlay } from '@/components/DetectionOverlay';
import { DEMO } from '@/lib/demo-results';
import styles from './auth.module.css';

export function AuthVisual() {
  return (
    <aside className={styles.visual} aria-hidden="true">
      <DetectionOverlay src="/demo/defect_00.jpg" alt="" detections={DEMO['defect_00.jpg'].detections} />
      <p className={styles.quote}>
        Um risco na chapa aparece na tela do inspetor com foto, posição e horário, em vez de aparecer na reclamação do cliente.
        <small>Acima: resultado do serviço de inspeção de qualidade sobre uma chapa escovada.</small>
      </p>
    </aside>
  );
}

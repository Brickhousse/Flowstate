import { useToast } from './toast';

export function Toasts() {
  const message = useToast((s) => s.message);
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
}

package stream

import (
	"errors"
	"fmt"
)

// ErrPermanent marca falhas que não adianta repetir (payload inválido, imagem
// corrompida, recurso inexistente). Vão direto para a DLQ.
var ErrPermanent = errors.New("falha permanente")

// Permanent embrulha err como permanente.
func Permanent(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrPermanent, fmt.Sprintf(format, args...))
}

// IsPermanent indica se err (ou algo que ele embrulha) é permanente.
func IsPermanent(err error) bool { return errors.Is(err, ErrPermanent) }

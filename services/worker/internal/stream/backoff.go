package stream

import (
	"math/rand/v2"
	"time"
)

// Backoff exponencial com jitter ("full jitter" limitado à metade inferior),
// para que retries de várias mensagens não batam no serviço ao mesmo tempo.
func Backoff(attempt int, base, max time.Duration) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	d := base << (attempt - 1)
	if d <= 0 || d > max {
		d = max
	}
	half := d / 2
	return half + time.Duration(rand.Int64N(int64(half)+1))
}

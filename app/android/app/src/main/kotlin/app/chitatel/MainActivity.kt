package app.chitatel

import com.ryanheise.audioservice.AudioServiceActivity

// AudioServiceActivity вместо FlutterActivity — требование audio_service:
// иначе плеер не переживает сворачивание приложения.
class MainActivity : AudioServiceActivity()

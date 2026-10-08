/*
 * Minimal WebAssembly interface to eSpeak NG for the RedZoc web tool
 * (https://www.redzoc.com/espeak/try/).
 *
 * Copyright (C) 2026 Ramees Muhammed (RedZoc)
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * Speech is synthesised synchronously into one growing 16-bit mono buffer,
 * which JavaScript reads after rz_synth() returns.
 */
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <espeak-ng/speak_lib.h>

static short *samples = NULL;
static int sample_count = 0;
static int sample_capacity = 0;

static int collect(short *wav, int count, espeak_EVENT *events)
{
	(void)events;
	if (wav == NULL || count <= 0)
		return 0;
	if (sample_count + count > sample_capacity) {
		int capacity = (sample_count + count) * 2;
		short *grown = realloc(samples, capacity * sizeof(short));
		if (grown == NULL)
			return 1; /* stop synthesis */
		samples = grown;
		sample_capacity = capacity;
	}
	memcpy(samples + sample_count, wav, count * sizeof(short));
	sample_count += count;
	return 0;
}

/* Returns the sample rate, or a negative value on failure. */
EMSCRIPTEN_KEEPALIVE int rz_init(const char *data_path)
{
	int rate = espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0, data_path, 0);
	if (rate > 0)
		espeak_SetSynthCallback(collect);
	return rate;
}

/* name is "<voice>" or "<voice>+<variant>", for example "hi+female". */
EMSCRIPTEN_KEEPALIVE int rz_set_voice(const char *name)
{
	return espeak_SetVoiceByName(name);
}

/* parameter: espeakRATE = 1, espeakVOLUME = 2, espeakPITCH = 3. */
EMSCRIPTEN_KEEPALIVE int rz_set_parameter(int parameter, int value)
{
	return espeak_SetParameter((espeak_PARAMETER)parameter, value, 0);
}

/* Returns the number of samples produced, or a negative error code. */
EMSCRIPTEN_KEEPALIVE int rz_synth(const char *text)
{
	sample_count = 0;
	espeak_ERROR error = espeak_Synth(text, strlen(text) + 1, 0, POS_CHARACTER, 0,
	                                  espeakCHARS_UTF8, NULL, NULL);
	if (error != EE_OK)
		return -(int)error;
	espeak_Synchronize();
	return sample_count;
}

EMSCRIPTEN_KEEPALIVE short *rz_samples(void)
{
	return samples;
}
